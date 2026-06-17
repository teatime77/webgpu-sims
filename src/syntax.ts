import { msg, assert, MyError, range } from "./utils.js";
import { CanvasDef, theDevice, theRunner } from "./SimulationRunner.js";
import { ComputePassBuilder } from "./pipeline.js";
import { LabelDef, RangeDef, SelectDef, UIDef } from "./SimUI.js";
import { ISimulationSchema, theSchema } from "./schema.js";
import { FieldDef, FieldDefToStr, makeFieldDefs, ReadBackDef, ResourceDef, StorageDef, WgslFormat } from "./resource.js";
import { Lexer, Token, TokenType } from "./lexer.js";

type ValueType = number | number[] | Record<string, any> | Record<string, any>[] | boolean | string | FunctionExpression | StructDeclaration;

export const constValues = new Map<string, ValueType>();
export let mapAsyncBuffer : GPUBuffer | undefined;

// ============================================================================
// Abstract Base Class
// ============================================================================
export abstract class BaseASTNode {
    // Forces every subclass to define its node type
    abstract readonly type: string;

    // Generates code back from the AST
    abstract toSource(): string;

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
    body: Map<string, VariableDeclaration>;

    constructor(body: Map<string, VariableDeclaration>) {
        super();
        this.body = body;
    }

    variables() : VariableDeclaration[] {
        return Array.from(this.body.values());
    }

    toSource(): string {
        return this.variables().map(decl => decl.toSource()).join('\n\n');
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

export class VariableDeclaration extends BaseASTNode {
    readonly type = 'VariableDeclaration';
    name: string;
    init: BaseASTNode;
    typeAnnotation?: string;

    constructor(name: string, init: BaseASTNode, typeAnnotation?: string) {
        super();
        this.name = name;
        this.init = init;
        this.typeAnnotation = typeAnnotation;
    }

    toSource(): string {
        const typeDef = this.typeAnnotation ? `: ${this.typeAnnotation}` : '';
        return `const ${this.name}${typeDef} = ${this.init.toSource()};`;
    }
}

export class ObjectExpression extends BaseASTNode {
    readonly type = 'ObjectExpression';
    properties: { key: string; value: BaseASTNode }[];

    constructor(properties: { key: string; value: BaseASTNode }[]) {
        super();
        this.properties = properties;
    }

    toSource(): string {
        const props = this.properties
            .map(p => `    ${p.key}: ${p.value.toSource()}`)
            .join(',\n');
        return `{\n${props}\n}`;
    }

    toObject() : any {
        const data : any = {};
        for(const {key, value} of this.properties){
            data[key] = value.getValue();
        }

        return data;
    }

    getValue() : ValueType {
        return this.toObject();
    }
}

export class ArrayExpression extends BaseASTNode {
    readonly type = 'ArrayExpression';
    elements: BaseASTNode[];

    constructor(elements: BaseASTNode[]) {
        super();
        this.elements = elements;
    }

    toSource(): string {
        const elements = this.elements.map(e => e.toSource()).join(', ');
        return `[${elements}]`;
    }

    getValue() : ValueType {
        return this.elements.map(x => x.getValue());
    }
}

export class Literal extends BaseASTNode {
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

    constructor(name: string) {
        super();
        this.name = name;
    }

    toSource(): string {
        return this.name;
    }

    getValue() : ValueType {
        const value = constValues.get(this.name)!;
        assert(value != undefined);

        return value;
    }
}

export class UnaryExpression extends BaseASTNode {
    readonly type = 'UnaryExpression';
    operator: string;
    argument: BaseASTNode;

    constructor(operator: string, argument: BaseASTNode) {
        super();
        this.operator = operator;
        this.argument = argument;
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

export class BinaryExpression extends BaseASTNode {
    readonly type = 'BinaryExpression';
    left: BaseASTNode;
    operator: string;
    right: BaseASTNode;

    constructor(left: BaseASTNode, operator: string, right: BaseASTNode) {
        super();
        this.left = left;
        this.operator = operator;
        this.right = right;
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
        default: throw new MyError();
        }
    }
}

export class GroupExpression extends BaseASTNode {
    readonly type = 'GroupExpression';
    expression: BaseASTNode;

    constructor(expression: BaseASTNode) {
        super();
        this.expression = expression;
    }

    toSource(): string {
        return `(${this.expression.toSource()})`;
    }

    getValue() : ValueType {
        return this.expression.getValue();
    }
}

export abstract class Statement extends BaseASTNode {
    abstract exec() : void;
}

export class BlockStatement extends Statement {
    readonly type = 'BlockStatement';
    statements : Statement[] = [];

    constructor(statements : Statement[]){
        super();
        this.statements = statements.slice();
    }

    toSource(): string {
        const s = this.statements.map(x => `${x}`).join("");
        return `{\n${s}}\n`;
    }

    exec() : void {
        for(const stmt of this.statements){
            stmt.exec();
        }
    }
}

export class ForStatement extends Statement {
    readonly type = 'ForStatement';
    iterator : string;
    collection  : CallExpression;
    block : BlockStatement;

    constructor(iterator : string, collection  : BaseASTNode, block : BlockStatement){
        super();
        this.iterator = iterator;
        assert(collection instanceof CallExpression);
        this.collection  = collection as CallExpression;
        this.block = block;
    }

    toSource(): string {
        return `for(const ${this.iterator} of ${this.collection}) ${this.block}`;
    }

    exec() : void {
        const collection = this.collection.getValue();
        if(Array.isArray(collection)){
            for(const _ of collection){
                this.block.exec();
            }
        }
    }
}

export class CallStatement extends Statement {
    readonly type = 'CallStatement';
    callExpr : CallExpression;
    shader? : ComputePassBuilder;
    srcStorage? : StorageDef;
    dstStorage? : ReadBackDef;
    busy : boolean = false;

    constructor(callExpr : CallExpression){
        super();
        this.callExpr = callExpr;
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

    exec() : void {
        if(this.callExpr.callee instanceof Identifier){
            if(this.callExpr.callee.name == "execute"){

                if(this.shader == undefined){
                    if(this.callExpr.arguments.length == 1){
                        const shaderNameTerm = this.callExpr.arguments[0];
                        const shaderName = this.getName(shaderNameTerm);

                        this.shader = theSchema.nodeMap.get(shaderName) as ComputePassBuilder;
                    }
                }

                assert(this.shader instanceof ComputePassBuilder);
                this.shader!.dispatch(theRunner.currentCommandEncoder!);
                return;
            }
            else if(this.callExpr.callee.name == "copy"){
                if(this.srcStorage == undefined){
                    if(this.callExpr.arguments.length == 2){
                        const names = this.callExpr.arguments.map(x => this.getName(x));
                        const resources = names.map(x => theSchema.resources.get(x)) as StorageDef[];
                        assert(resources.length == 2);
                        [this.srcStorage, this.dstStorage] = [resources[0], resources[1] as ReadBackDef];
                        assert(this.srcStorage instanceof StorageDef && this.dstStorage instanceof ReadBackDef);
                        msg(`copy:${this.srcStorage.id} => ${this.dstStorage.id}`);
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



export class FunctionExpression extends BaseASTNode {
    readonly type = 'FunctionExpression';
    body: BlockStatement;

    constructor(body: BlockStatement) {
        super();
        this.body = body;
    }

    toSource(): string {
        return `()=>${this.body}`;
    }

    getValue() : ValueType {
        return this;
    }

    execFunction(){
        this.body.exec();
    }
}

export class MemberExpression extends BaseASTNode {
    readonly type = 'MemberExpression';
    object: BaseASTNode;
    property: Identifier;

    constructor(object: BaseASTNode, property: Identifier) {
        super();
        this.object = object;
        this.property = property;
    }

    toSource(): string {
        return `${this.object.toSource()}.${this.property.toSource()}`;
    }
}

export class CallExpression extends BaseASTNode {
    readonly type = 'CallExpression';
    callee: BaseASTNode;
    arguments: BaseASTNode[];

    constructor(callee: BaseASTNode, args: BaseASTNode[]) {
        super();
        this.callee = callee;
        this.arguments = args;
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
