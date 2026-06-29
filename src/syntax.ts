import { msg, assert, MyError, range } from "./utils.js";
import { CanvasDef, PassCommand, theDevice, theRunner } from "./SimulationRunner.js";
import { ComputePassBuilder } from "./pipeline.js";
import { LabelDef, RangeDef, SelectDef, UIDef } from "./SimUI.js";
import { ISimulationSchema, theSchema } from "./schema.js";
import { FieldDef, FieldDefToStr, makeFieldDefs, ReadBackDef, ResourceDef, StorageDef, UniformDef, WgslFormat } from "./resource.js";
import { Lexer, Token, TokenType } from "./lexer.js";

type ValueType = number | number[] | Record<string, any> | Record<string, any>[] | boolean | string | FunctionExpression | StructDeclaration;

export interface Const {
    name : string;
    value : any;
}

export const constValues = new Map<string, Const>();
export let mapAsyncBuffer : GPUBuffer | undefined;
let tick = 0;

// ============================================================================
// Abstract Base Class
// ============================================================================
export abstract class BaseASTNode {
    // Forces every subclass to define its node type
    abstract readonly type: string;
    parent : Expression | Statement | null = null;
    children : Expression[] = [];

    // Generates code back from the AST
    abstract toSource(): string;

    private setParent(parent : Expression | Statement | null = null){
        this.parent = parent;
    }

    setParents(children : Iterable<BaseASTNode>){
        const arr = Array.from(children);
        this.children.push(...arr);
        for(const x of arr){ x.setParent(this) }
    }

    getAll(all:BaseASTNode[]){
        all.push(this);
        this.children.forEach(x => x.getAll(all));
    }

    getVariables() : Variable[] {
        return [];
    }

    toString() : string{
        return this.toSource();
    }

    getString() : string {
        const value = this.getValue();
        assert(typeof value == "string");
        return value as string;
    }

    getBoolean() : boolean {
        const value = this.getValue();
        assert(typeof value == "boolean");
        return value as boolean;
    }

    getNumber() : number {
        const value = this.getValue();
        assert(typeof value == "number");
        return value as number;
    }

    getInt() : number {
        const n = this.getNumber();
        assert(n == Math.floor(n));

        return n;
    }

    getNumeric() : number | number[] {
        const value = this.getValue();
        assert(typeof value == "number" || Array.isArray(value) && value.every(x => typeof x == "number"));
        return value as (number | number[]);
    }

    getValue() : ValueType {
        throw new MyError();
    }

    toObject() : any {
        const value = this.getValue();
        assert(typeof value == "object");
        return value;
    }
}

// ============================================================================
// AST Node Classes (Compatible with erasableSyntaxOnly)
// ============================================================================

export class Program extends BaseASTNode {
    readonly type = 'Program';
    varDecls : VariableDeclaration[];

    constructor(varDecls : VariableDeclaration[]) {
        super();
        this.varDecls = varDecls.slice();
        this.setParents(this.varDecls);
    }

    getVariables() : Variable[] {
        return this.varDecls.map(x => x.variable);
    }

    toSource(): string {
        throw new MyError();
    }
}

export class StructDeclaration extends BaseASTNode {
    readonly type = 'StructDeclaration';
    name: string;
    fields:FieldDef[];
    size : number = NaN;

    constructor(name: string, fields:FieldDef[]) {
        super();
        this.name = name;
        this.fields = fields;
    }

    getValue() : ValueType {
        return this;
    }

    toSource(): string {
        return `
struct ${this.name} {
${this.fields.map(x => FieldDefToStr(x)).join("")} 
};\n`;
    }

    setStructSize(){
        let offset = makeFieldDefs(this.fields);

        const cnt = Math.ceil(offset / 4);
        this.size = cnt * 4;
    }
}

export class Variable extends BaseASTNode {
    readonly type = 'Variable';
    name : string;
    typeAnnotation?: string;
    init? : Expression;
    value?: Expression;

    constructor(name : string, typeAnnotation?: string, init? : Expression){
        super();
        this.name = name;
        this.typeAnnotation = typeAnnotation;
        this.init = init;
        this.value = init;

        if(this.init != undefined){
            this.setParents([this.init]);
        }
    }

    getValue() : ValueType {
        if(this.value == undefined){
            throw new MyError();
        }

        if(this.value instanceof Expression){
            return this.value.getValue();
        }

        return this.value;
    }

    setValue(value : Expression){
        this.value = value;
    }

    toSource(): string {
        const typeDef = this.typeAnnotation ? `: ${this.typeAnnotation}` : '';
        const init = this.init != undefined ? ` = $${this.init}` : "";
        return `${this.name}${typeDef}${init}`;
    }
}

export abstract class  Expression extends BaseASTNode {
}

export class ObjectExpression extends Expression {
    readonly type = 'ObjectExpression';
    properties: Map<string, Expression>;

    constructor(properties: Map<string, Expression>) {
        super();
        this.properties = properties;

        this.setParents(this.properties.values());
    }

    toSource(): string {
        const props = Array.from(this.properties.entries()
            .map(p => `    ${p[0]}: ${p[1].toSource()}`)) 
            .join(',\n');
        return `{\n${props}\n}`;
    }

    toObject() : any {
        const data : any = {};
        for(const [key, value] of this.properties.entries()){
            data[key] = value.getValue();
        }

        return data;
    }

    getValue() : ValueType {
        return this.toObject();
    }
}

export class ArrayExpression extends Expression {
    readonly type = 'ArrayExpression';
    elements: BaseASTNode[];

    constructor(elements: BaseASTNode[]) {
        super();
        this.elements = elements;

        this.setParents(this.elements);
    }

    toSource(): string {
        const elements = this.elements.map(e => e.toSource()).join(', ');
        return `[${elements}]`;
    }

    getValue() : ValueType {
        return this.elements.map(x => x.getValue());
    }
}

export class Literal extends Expression {
    readonly type = 'Literal';
    value: string | number | boolean;
    rawType: 'string' | 'number' | 'boolean';

    constructor(value: string | number | boolean, rawType: 'string' | 'number' | 'boolean') {
        super();
        this.value = value;
        this.rawType = rawType;
    }

    toSource(): string {
        if (this.rawType === 'string') {
            return `"${this.value}"`; 
        }
        return String(this.value);
    }

    getValue() : ValueType {
        return this.value;
    }
}

export class Identifier extends BaseASTNode {
    readonly type = 'Identifier';
    name: string;
    refVar? : Variable;
    resourceRef?: ResourceDef;

    constructor(name: string) {
        super();
        this.name = name;
        if(name == "state"){
            // msg("");
        }
    }

    isFieldReference() : boolean {
        return this.parent instanceof MemberExpression && this.parent.property == this;
    }

    toSource(): string {
        return this.name;
    }

    setValue(val : Expression){
        if(this.refVar != undefined){
            this.refVar.setValue(val);
        }
    }

    getValue() : ValueType {
        if(this.refVar != undefined){
            return this.refVar.getValue();
        }

        if(this.resourceRef != undefined){
            return this.resourceRef;
        }

        const cnst = constValues.get(this.name)!;
        assert(cnst != undefined);

        return cnst.value;
    }
}

export class UnaryExpression extends Expression {
    readonly type = 'UnaryExpression';
    operator: string;
    argument: BaseASTNode;

    constructor(operator: string, argument: BaseASTNode) {
        super();
        this.operator = operator;
        this.argument = argument;

        this.setParents([this.argument]);
    }

    toSource(): string {
        return `${this.operator}${this.argument.toSource()}`;
    }

    getValue() : ValueType {
        assert(this.operator == "-");
        const n = this.argument.getNumber();
        return - n;
    }
}

export class BinaryExpression extends Expression {
    readonly type = 'BinaryExpression';
    left: Expression;
    operator: string;
    right: Expression;

    constructor(left: Expression, operator: string, right: Expression) {
        super();
        this.left = left;
        this.operator = operator;
        this.right = right;

        this.setParents([this.left, this.right]);
    }

    toSource(): string {
        return `${this.left.toSource()} ${this.operator} ${this.right.toSource()}`;
    }

    getValue() : ValueType {
        const n1 = this.left.getNumber();
        const n2 = this.right.getNumber();
        switch(this.operator){
        case "+": return n1 + n2;
        case "-": return n1 - n2;
        case "*": return n1 * n2;
        case "/": return n1 / n2;
        case "==": return n1 == n2; 
        case "!=": return n1 != n2; 
        case "<" : return n1 <  n2; 
        case ">" : return n1 >  n2; 
        case "<=": return n1 <= n2; 
        case ">=": return n1 >= n2; 
        default: throw new MyError();
        }
    }
}

export class GroupExpression extends Expression {
    readonly type = 'GroupExpression';
    expression: BaseASTNode;

    constructor(expression: BaseASTNode) {
        super();
        this.expression = expression;

        this.setParents([this.expression]);
    }

    toSource(): string {
        return `(${this.expression.toSource()})`;
    }

    getValue() : ValueType {
        return this.expression.getValue();
    }
}

export abstract class Statement extends BaseASTNode {
    // abstract *exec();

    *exec() : Generator<PassCommand, void, unknown>{
    }
}

export class VariableDeclaration extends Statement {
    readonly type = 'VariableDeclaration';
    variable : Variable;

    constructor(name: string, init: BaseASTNode, typeAnnotation?: string) {
        super();
        this.variable = new Variable(name, typeAnnotation, init);

        this.setParents([this.variable]);
    }

    getVariables() : Variable[] {
        return [this.variable];
    }

    toSource(): string {
        return `const ${this.variable};`;
    }
}

export class YieldStatement extends Statement {
    readonly type = 'YieldStatement';

    toSource(): string {
        return `yield;\n`;
    }

    *exec() : Generator<PassCommand, void, unknown>{
        yield "frame";
    }
}

export class BlockStatement extends Statement {
    readonly type = 'BlockStatement';
    statements : Statement[] = [];

    constructor(statements : Statement[]){
        super();
        this.statements = statements.slice();

        this.setParents(this.statements);
    }

    toSource(): string {
        const s = this.statements.map(x => `${x}`).join("");
        return `{\n${s}}\n`;
    }

    *exec() : Generator<PassCommand, void, unknown>{
        for(const stmt of this.statements){
            yield* stmt.exec();
        }
    }
}

export class WhileStatement extends Statement {
    readonly type = 'WhileStatement';
    condition : Expression;
    block : BlockStatement;

    constructor(condition : Expression, block : BlockStatement){
        super();
        this.condition = condition;
        this.block = block;

        this.setParents([this.condition, this.block]);
    }

    toSource(): string {
        return `while(${this.condition}) ${this.block}`;
    }

    *exec() : Generator<PassCommand, void, unknown>{
        while(true){
            const ok = this.condition.getBoolean();
            if(!ok){
                break;
            }
            yield* this.block.exec();
        }
    }
}

export class ForStatement extends Statement {
    readonly type = 'ForStatement';
    iterator : Variable;
    collection  : CallExpression;
    block : BlockStatement;

    constructor(iterator : string, collection  : BaseASTNode, block : BlockStatement){
        super();
        this.iterator = new Variable(iterator);
        assert(collection instanceof CallExpression);
        this.collection  = collection as CallExpression;
        this.block = block;

        this.setParents([this.collection, this.block]);
    }

    getVariables() : Variable[] {
        return [this.iterator];
    }

    toSource(): string {
        return `for(const ${this.iterator} of ${this.collection}) ${this.block}`;
    }

    *exec() : Generator<PassCommand, void, unknown>{
        const collection = this.collection.getValue();
        if(Array.isArray(collection)){
            for(const value of collection){
                this.iterator.setValue(value);
                yield* this.block.exec();
            }
        }
    }
}

export class IfStatement extends Statement {
    readonly type = 'IfStatement';
    conditions : Expression[];
    blocks:BlockStatement[];

    constructor(conditions : Expression[], blocks:BlockStatement[]){
        super();
        this.conditions = conditions;
        this.blocks = blocks;

        this.setParents(this.conditions.concat(this.blocks));
    }

    hasElse() : boolean {
        return this.conditions.length < this.blocks.length;
    }

    *exec() : Generator<PassCommand, void, unknown>{
        for(const [idx, expr] of this.conditions.entries()){
            const ok = expr.getBoolean();
            if(ok){
                yield* this.blocks[idx].exec();
                return;
            }
        }

        if(this.hasElse()){
            yield* this.blocks.at(-1)!.exec();
        }
    }

    toSource(): string {
        let str = "";

        for(const [idx, expr] of this.conditions.entries()){
            if(idx == 0){
                str += "if";
            }
            else{
                str += "else if";
            }

            str += `(${expr})`;
            str += `${this.blocks[idx]}`;
        }


        if(this.hasElse()){
            str += `else ${this.blocks.at(-1)!}`;
        }

        return str;
    }
}

export class CallStatement extends Statement {
    readonly type = 'CallStatement';
    callExpr : CallExpression;
    shader? : ComputePassBuilder;
    srcStorage? : StorageDef | ReadBackDef;
    dstStorage? : StorageDef | ReadBackDef;
    busy : boolean = false;

    constructor(callExpr : CallExpression){
        super();
        this.callExpr = callExpr;

        this.setParents([this.callExpr]);
    }

    toSource(): string {
        return `${this.callExpr};\n`;
    }

    getName(term : BaseASTNode) : string{
        if(term instanceof Identifier){
            return term.name;
        }
        else if(term instanceof Literal){
            return term.getString();
        }
        else{
            throw new MyError();
        }
    }

    *exec() : Generator<PassCommand, void, unknown> {
        if(this.callExpr.callee instanceof Identifier){
            if(this.callExpr.callee.name == "execute"){

                if(this.shader == undefined){
                    assert(1 <= this.callExpr.arguments.length)

                    const shaderNameTerm = this.callExpr.arguments[0];
                    const shaderName = this.getName(shaderNameTerm);

                    this.shader = theSchema.nodeMap.get(shaderName) as ComputePassBuilder;

                }

                let overrides: Record<string, string> | undefined = undefined;
                if (this.callExpr.arguments.length == 2) {
                    // Parse the second argument as a standard JS object map
                    const overrideTerm = this.callExpr.arguments[1];
                    if (overrideTerm.type === 'ObjectExpression') {
                        overrides = overrideTerm.getValue() as Record<string, string>;
                    }
                }

                if(tick % 10 == 0){
                    // msg(`execute: ${this.shader!.id}`);
                }
                assert(this.shader instanceof ComputePassBuilder);
                this.shader!.dispatch(theRunner, overrides);
                return;
            }
            else if(this.callExpr.callee.name == "copy"){
                if(this.srcStorage == undefined){
                    if(this.callExpr.arguments.length == 2){
                        const names = this.callExpr.arguments.map(x => this.getName(x));
                        const resources = names.map(x => theSchema.resources.get(x)) as (StorageDef | ReadBackDef)[];
                        assert(resources.length == 2 && resources.every(x => x instanceof StorageDef || x instanceof ReadBackDef));
                        [this.srcStorage, this.dstStorage] = resources;
                        // msg(`copy:${this.srcStorage.id} => ${this.dstStorage.id}`);
                    }
                    else{
                        throw new MyError();
                    }
                }

                theRunner.copyStorages.push(this);
                return;
            }
        }

        throw new MyError();
    }

    async copyBuffers(device : GPUDevice){
        if(this.busy){
            return;
        }

        this.busy = true;
        if(this.srcStorage instanceof StorageDef && this.dstStorage instanceof ReadBackDef){

            const srcBuffer = this.srcStorage.buffers[0];
            const dstBuffer = this.dstStorage.buffers[0];

            const sizes = [srcBuffer.size, dstBuffer.size, this.dstStorage.structDef.size, this.dstStorage.data.byteLength];
            assert(sizes.every(x => x == sizes[0]));

            const copyEncoder = device.createCommandEncoder();
            copyEncoder.copyBufferToBuffer(srcBuffer, 0, dstBuffer, 0, this.dstStorage.structDef.size);
            device.queue.submit([copyEncoder.finish()]);

            // Wait for the GPU to finish the copy and map the buffer
            mapAsyncBuffer = dstBuffer;
            await dstBuffer.mapAsync(GPUMapMode.READ);
            mapAsyncBuffer = undefined;

            // Read AND copy the data into a new ArrayBuffer using .slice()
            this.dstStorage.data.set(new Float32Array(dstBuffer.getMappedRange()));

            // Now it is safe to unmap. finalScalars contains a safe copy of the data.
            dstBuffer.unmap();

            this.dstStorage.setLabelValues();
        }

        this.busy = false;
    }
}

export class AssignmentStatement extends Statement {
    readonly type = 'AssignmentStatement';
    lvalue: MemberExpression | Identifier;
    operator: string;
    rvalue: Expression;

    constructor(lvalue: Expression, operator: string, rvalue: Expression){
        super();
        if(lvalue instanceof MemberExpression || lvalue instanceof Identifier){

            this.lvalue = lvalue;
        }
        else{
            throw new MyError();
        }

        this.operator = operator;
        this.rvalue = rvalue;

        this.setParents([this.lvalue, this.rvalue]);
    }

    toSource(): string {
        return `${this.lvalue} ${this.operator} ${this.rvalue};\n`;
    }

    *exec() : Generator<PassCommand, void, unknown> {
        if(this.lvalue instanceof MemberExpression && this.lvalue.object.resourceRef instanceof UniformDef){
            theRunner.changedUniforms.add(this.lvalue.object.resourceRef);
            if(tick % 10 == 0){
                // msg(`assign uniform:${this.lvalue} <= ${this.rvalue}(${this.rvalue.getValue()})`);
            }
        }

        this.lvalue.setValue(this.rvalue);
    }
}


export class FunctionExpression extends BaseASTNode {
    readonly type = 'FunctionExpression';
    body: BlockStatement;

    constructor(body: BlockStatement) {
        super();
        this.body = body;

        this.setParents([this.body]);
    }

    toSource(): string {
        return `()=>${this.body}`;
    }

    getValue() : ValueType {
        return this;
    }

    *execFunction() : Generator<PassCommand, void, unknown>{        
        yield* this.body.exec();
        tick++;
    }
}

export class MemberExpression extends Expression {
    readonly type = 'MemberExpression';
    object: Identifier;
    property: Identifier;

    constructor(object: Expression, property: Identifier) {
        super();
        if(object instanceof Identifier){
            this.object = object;
        }
        else{
            throw new MyError();
        }
        this.property = property;

        this.setParents([this.object]);
    }

    toSource(): string {
        return `${this.object.toSource()}.${this.property.toSource()}`;
    }

    getObject() : ObjectExpression{
        const id = this.object;
        if(id.refVar != undefined && id.refVar.value instanceof ObjectExpression){
            return id.refVar.value;
        }

        throw new MyError();
    }

    setValue(val : Expression){
        assert(this.getValue() != undefined);

        if(this.object.resourceRef instanceof UniformDef){
            if(this.object.resourceRef.obj == undefined){
                throw new MyError();
            }
            this.object.resourceRef.obj.value[this.property.name] = val.getNumber();
        }
        else{

            const obj = this.getObject();
            obj.properties.set(this.property.name, val);
        }
    }

    getValue() : ValueType {
        let value : any;

        if(this.object.resourceRef instanceof UniformDef){
            if(this.object.resourceRef.obj == undefined){
                throw new MyError();
            }
            value = this.object.resourceRef.obj.value[this.property.name];
        }
        else if(this.object.resourceRef instanceof ReadBackDef){
            value = this.object.resourceRef.getFieldValue(this.property.name);
        }
        else{
            const obj = this.getObject();
            value = obj.properties.get(this.property.name);
        }

        if(value != undefined){
            return value;
        }
        
        throw new MyError();
    }
}

export class CallExpression extends Expression {
    readonly type = 'CallExpression';
    callee: Expression;
    arguments: Expression[];

    constructor(callee: Expression, args: BaseASTNode[]) {
        super();
        this.callee = callee;
        this.arguments = args;

        this.setParents([this.callee].concat(this.arguments));
    }

    toSource(): string {
        const args = this.arguments.map(a => a.toSource()).join(', ');
        return `${this.callee.toSource()}(${args})`;
    }

    getValue() : ValueType {
        if(this.callee instanceof MemberExpression){
            if(this.callee.object instanceof Identifier){
                if(this.callee.object.name == "Math"){
                    switch(this.callee.property.name){
                    case "ceil":{
                        assert(this.arguments.length == 1);
                        const n = this.arguments[0].getNumber();
                        return Math.ceil(n);
                    }                    
                    case "max":{
                        const ns = this.arguments.map(x => x.getNumber());
                        return Math.max(...ns);
                    }                    
                    }
                }
            }
        }
        else if(this.callee instanceof Identifier){
            if(this.callee.name == "range"){
                assert(this.arguments.length == 1);
                const count = this.arguments[0].getInt();
                return range(count);
            }
        }

        throw new MyError();
    }
}
