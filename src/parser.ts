// ============================================================================
// AST Node Classes
// ============================================================================

import { msg, assert, MyError, range } from "./utils.js";
import { CanvasDef, theDevice, theRunner } from "./SimulationRunner.js";
import { ComputePassBuilder } from "./pipeline.js";
import { LabelDef, RangeDef, SelectDef, UIDef } from "./SimUI.js";
import { ISimulationSchema, SimulationSchema, theSchema } from "./schema.js";
import { FieldDef, FieldDefToStr, makeFieldDefs, ReadBackDef, ResourceDef, StorageDef, UniformDef, WgslFormat } from "./resource.js";
import { Lexer, Token, TokenType } from "./lexer.js";
import { BaseASTNode, Program, StructDeclaration, VariableDeclaration, ObjectExpression, ArrayExpression, Literal, Identifier, UnaryExpression, BinaryExpression, GroupExpression, Statement, BlockStatement, ForStatement, CallStatement, FunctionExpression, MemberExpression, CallExpression, constValues, Expression, IfStatement, AssignmentStatement, Variable, Const } from "./syntax.js";

let lexer: Lexer;

class SyntaxError extends MyError {
    constructor(token : Token, message : string){
        super(message);

        const tokens = lexer.tokens.filter(x => x.line == token.line);        
        const words = tokens.map(x => x.value);
        const idx = tokens.indexOf(token);
        if(idx != -1){
            words.splice(idx, 0, "^");
        }

        msg(`syntax error:${message}\n${words.join(" ")}`);
    }
}



// ============================================================================
// 3. Syntax Analyzer (Parser) - Class-Based AST Version
// ============================================================================
export class Parser {
    private lexer: Lexer;
    private currentToken!: Token;
    source: string;

    constructor(source: string) {
        this.source = source;
        this.lexer = new Lexer(source);
        this.advance();

        lexer = this.lexer;
    }

    private advance() {
        this.currentToken = this.lexer.nextToken();
        // msg(`token:${this.currentToken.value} ${this.currentToken.type}`);
    }

    private peek(): Token {
        return this.currentToken;
    }

    private peekText(): string {
        return this.currentToken.value;
    }

    private consume(expectedValue?: string): Token {
        const token = this.currentToken;
        if (expectedValue && token.value !== expectedValue) {
            throw new SyntaxError(token, `Expected '${expectedValue}' but found '${token.value}' at index ${token.start}`);
        }
        this.advance();
        return token;
    }

    private consumeType(expectedType: TokenType): Token {
        const token = this.currentToken;
        if (token.type !== expectedType) {
            throw new SyntaxError(token, `Expected '${expectedType}' but found '${token.value}' at index ${token.start}`);
        }
        this.advance();
        return token;
    }

    private consumeIdentifier(): string {
        const id = this.consumeType("Identifier");
        return id.value;
    }

    public parse(): Program {
        const varDecls : VariableDeclaration[] = [];

        while (this.peek().type !== 'EOF') {
            switch(this.currentToken.value){
            case "import":
            case "export":
                this.parseImportExport();
                break;

            case "const":{
                const varDecl = this.parseVariableDeclaration();
                varDecls.push(varDecl);
                break;
            }
            default:
                throw new SyntaxError(this.peek(), `parse program error`);
            }
        }
        return new Program(varDecls);
    }

    parseImportExport(){
        while(true){
            const token = this.currentToken;
            this.advance();
            if(token.value == ";"){
                break;
            }
        }
    }

    private parseStructDeclarations(){
        this.consume("`");
        
        const elements : StructDeclaration[] = [];
        while(this.peek().value != "`"){
            this.consume("struct");
            const structName = this.consumeIdentifier();

            this.consume("{");

            const fields:FieldDef[] = [];
            while(this.peek().value != "}"){
                const fieldName = this.consumeIdentifier();
                this.consume(":");
                let typeName = this.consumeIdentifier();
                if(this.peek().value == "<"){
                    this.consume("<");
                    const elementType = this.consumeIdentifier();
                    this.consume(">");
                    typeName = `${typeName}<${elementType}>`;
                }

                const field = { name:fieldName, format:typeName } as FieldDef;
                fields.push(field);

                const token = this.peek();
                if(token.value == ","){
                    this.consume(",");
                }
                else{
                    break;
                }
            }

            this.consume("}");
            this.consume(';');

            const structDecl = new StructDeclaration(structName, fields);
            elements.push(structDecl);

            msg(`struct:${structDecl.toSource()}`);
        }

        this.consume("`");

        return new ArrayExpression(elements);
    }

    private parseVariableDeclaration(): VariableDeclaration {
        this.consume('const'); // Expect const
        
        const nameToken = this.consume();
        if (nameToken.type !== 'Identifier'){
            throw new SyntaxError(nameToken, `Expected Identifier after const`);
        } 

        let typeAnnotation;
        // Handle TypeScript type annotation (e.g. : SimulationSchema)
        if (this.peek().value === ':') {
            this.consume(':');
            const typeToken = this.consume();
            typeAnnotation = typeToken.value;
        }

        this.consume('=');
        const init = this.parseExpression();

        // Optional semicolon
        if (this.peek().value === ';') {
            this.consume(';');
        }

        const va = new VariableDeclaration(nameToken.value, init, typeAnnotation);

        const value = init.getValue();
        constValues.set(va.variable.name, { name:va.variable.name, value} );
        // msg(`const-Values:${va.name} = ${value}`);

        return va;
    }

    public parseExpression(): Expression {
        return this.parseRelational();
    }

    private parseRelational() : Expression {
        let left = this.parseAdditive();

        if(["==", "!=", "<", ">", "<=", ">="].includes(this.peekText())){
            const operator = this.consume().value;
            let right = this.parseAdditive();

            return new BinaryExpression(left, operator, right);
        }
        else{
            return left;
        }
    }

    // 1. Level: + and - (Left Associative)
    private parseAdditive(): Expression {
        let left = this.parseMultiplicative();
        
        while (this.peek().value === '+' || this.peek().value === '-') {
            const operator = this.consume().value;
            const right = this.parseMultiplicative();
            left = new BinaryExpression(left, operator, right);
        }
        
        return left;
    }

    // 2. Level: *, /, and % (Left Associative)
    private parseMultiplicative(): Expression {
        let left = this.parseExponentiation();
        
        while (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%') {
            const operator = this.consume().value;
            const right = this.parseExponentiation();
            left = new BinaryExpression(left, operator, right);
        }
        
        return left;
    }

    // 3. Level: ** (Right Associative)
    private parseExponentiation(): Expression {
        let left = this.parsePrimary();
        
        if (this.peek().value === '**') {
            const operator = this.consume().value;
            // Recursive call for Right-Associativity (e.g. 2 ** 3 ** 2)
            const right = this.parseExponentiation(); 
            left = new BinaryExpression(left, operator, right);
        }
        
        return left;
    }

    // 4. Level: Unary, Groupings, Primitives, Identifiers, Objects, Arrays
    private parsePrimary(): Expression {
        const token = this.peek();
        let node: BaseASTNode;

        // Handle Parentheses for Math Groupings e.g. (1 + 2) * 3
        if (token.type === 'Punctuator' && token.value === '(') {
            if(this.lexer.peekTexts(2) == ")=>"){
                return this.parseFunction();
            }

            this.consume('(');
            const expr = this.parseExpression();
            this.consume(')');
            node = new GroupExpression(expr);
        }

        // Handle Unary Minus (e.g., -0.7)
        else if (token.type === 'Punctuator' && token.value === '-') {
            this.consume('-');
            const argument = this.parsePrimary();
            return new UnaryExpression('-', argument);
        }

        // Handle Objects
        else if (token.type === 'Punctuator' && token.value === '{') {
            node = this.parseObject();
        }

        // Handle Arrays
        else if (token.type === 'Punctuator' && token.value === '[') {
            node = this.parseArray();
        }

        else if (token.type === 'Punctuator' && token.value === "`") {
            node = this.parseStructDeclarations();
        }

        // Handle Functions (Reads body as raw string)
        else if (token.type === 'Keyword' && token.value === 'function') {
            node = this.parseFunction();
        }

        // Primitives & Identifiers
        else if (token.type === 'String') {
            this.consume();
            node = new Literal(token.value, 'string');
        }

        else if (token.type === 'Number') {
            this.consume();
            node = new Literal(parseFloat(token.value), 'number');
        }

        else if (token.type === 'Keyword' && (token.value === 'true' || token.value === 'false')) {
            this.consume();
            node = new Literal(token.value === 'true', 'boolean');
        }

        else if (token.type === 'Identifier') {
            this.consume();
            node = new Identifier(token.value);
        }

        else {
            throw new SyntaxError(token, `Unexpected token '${token.value}' at index ${token.start}`);
        }

        // Handle trailing property accesses and method calls
        while (true) {
            if (this.peek().value === '.') {
                this.consume('.');
                const propToken = this.consume();
                if (propToken.type !== 'Identifier') {
                    throw new SyntaxError(propToken, `Expected Identifier after '.' at index ${propToken.start}`);
                }
                node = new MemberExpression(node, new Identifier(propToken.value));
            } else if (this.peek().value === '(') {
                this.consume('(');
                const args: BaseASTNode[] = [];
                while (this.peek().value !== ')') {
                    args.push(this.parseExpression());
                    if (this.peek().value === ',') {
                        this.consume(',');
                    }
                }
                this.consume(')');
                node = new CallExpression(node, args);
            } else {
                break;
            }
        }

        return node;
    }

    private parseObject(): Expression {
        const properties = new Map<string, Expression>();
        this.consume('{');

        while (this.peek().value !== '}') {
            const keyToken = this.consume();
            const key = keyToken.value;
            
            this.consume(':');
            const value = this.parseExpression();
            properties.set(key, value);

            if (this.peek().value === ',') {
                this.consume(',');
            }
        }
        this.consume('}');
        return new ObjectExpression(properties);
    }

    private parseArray(): ArrayExpression {
        const elements = [];
        this.consume('[');

        while (this.peek().value !== ']') {
            elements.push(this.parseExpression());
            if (this.peek().value === ',') {
                this.consume(',');
            }
        }
        this.consume(']');
        return new ArrayExpression(elements);
    }

    private parseSingleStatement() : Statement {
        const expr = this.parsePrimary();
        if(expr instanceof CallExpression){
            this.consume(';');

            return new CallStatement(expr);
        }

        if([ "=", "+=", "-=", "*=", "/=" ].includes(this.peekText())){
            const operator = this.consume().value;

            const right = this.parsePrimary();
            this.consume(';');

            return new AssignmentStatement(expr, operator, right);
        }

        throw new SyntaxError(this.peek(), "parse Single Statement error");
    }

    private parseBlock() : BlockStatement {
        this.consume('{');

        const statements : Statement[] = [];
        while(this.peek().value != "}"){
            const statement = this.parseStatement();
            statements.push(statement);
        }
        this.consume('}');

        return new BlockStatement(statements);
    }

    private parseFor() : ForStatement {
        this.consume("for");
        this.consume("(");
        this.consume("const");
        const iteratorToken = this.consumeType("Identifier");
        this.consume("of");
        const collection = this.parseExpression();
        this.consume(")");

        const block = this.parseBlock();

        return new ForStatement(iteratorToken.value, collection, block);
    }

    private parseIfSub(conditions : Expression[], blocks:BlockStatement[]){
        this.consume("if");
        this.consume("(");
        const condition = this.parseExpression();
        this.consume(")");        
        const block = this.parseBlock();

        conditions.push(condition);
        blocks.push(block);
    }

    private parseIf() : IfStatement {
        let conditions : Expression[] = [];
        let blocks:BlockStatement[] = [];

        this.parseIfSub(conditions, blocks);

        while(this.peekText() == "else"){
            this.consume("else");

            if(this.peekText() == "if"){
                this.parseIfSub(conditions, blocks);
                continue;
            }
            else if(this.peekText() == "{"){
                const block = this.parseBlock();
                blocks.push(block);
                break;
            }
        }

        return new IfStatement(conditions, blocks);
    }

    private parseStatement() : Statement {
        const token = this.peek();
        if(token.value == "{"){
            return this.parseBlock();
        }
        else if(token.value == "for"){
            return this.parseFor();
        }
        else if(token.value == "if"){
            return this.parseIf();
        }
        else if(token.type == "Identifier"){
            return this.parseSingleStatement();
        }
        else{
            throw new SyntaxError(token, "parse statement error");
        }
    }

    private parseFunction(): FunctionExpression {
        ["(", ")", "=>"].forEach(x => this.consume(x));

        const block = this.parseBlock();

        return new FunctionExpression(block);
    }
}

function getObj(value : Identifier) : Const {
    assert(value instanceof Identifier);
    const obj = constValues.get(value.name)!;
    assert(obj != undefined);
    return obj;
}

function readResource(resourceObj:ObjectExpression) {
    assert(resourceObj instanceof ObjectExpression);

    const data : any = {};

    for(const [key, value] of resourceObj.properties.entries()){
        switch(key){
        case "type":
            data[key] = value.getString();
            break;
        case "format":
            data[key] = value.getString();
            break;
        case "count":
            data[key] = value.getNumber();
            break;
        case "meshRef":
            data[key] = value.getString();
            break;
        case "shape":
            data[key] = value.getString();
            break;
        case "obj":
            data[key] = getObj(value as Identifier);
            break;
        case "division":
            data[key] = value.getNumber();
            break;
        case "topology":
        case "shadingModel":
        case "canvasId":
            data[key] = value.getString();
            break;
        default:
            throw new MyError();
        }
    }

    return data;
}

function readResources(resourceObj:ObjectExpression){
    assert(resourceObj instanceof ObjectExpression);
    const data : any = {};
    for(const [key, value] of resourceObj.properties.entries()){
        data[key] = readResource(value as ObjectExpression);
    }

    return data;
}

function readBindings(binding:ArrayExpression) {
    assert(binding instanceof ArrayExpression);
    return binding.elements.map(x => x.toObject());
}

function readShaders(shaders:ArrayExpression){
    assert(shaders.elements.every(x => x instanceof ObjectExpression));
    
    const shadersData = [];
    for(const shaderObj of shaders.elements as ObjectExpression[]){
        const shader : any = {};
        for(const [key, value] of shaderObj.properties.entries()){
            switch(key){
            case "id":
                shader.id = value.getString();
                break;
            case "type":
                shader.type = value.getString();
                break;
            case "workgroupSize":
                shader.workgroupSize = value.getNumeric();
                break;
            case "workgroupCount":
                shader.workgroupCount = value.getNumeric();
                break;
            case "bindings":
                shader.bindings = readBindings(value as ArrayExpression);
                break;
            default:
                throw new MyError();
            }
        }

        shadersData.push(shader);
    }

    return shadersData;
}

function readOption(obj : ObjectExpression){
    assert(obj instanceof ObjectExpression);
    const data : any = {};
    for(const [key, value] of obj.properties.entries()){
        switch(key){
        case "value":
            data[key] = value.getNumber();
            break;
        case "text":
            data[key] = value.getString();
            break;
        default:
            throw new MyError();
        }
    }

    return data;
}

function readUIs(obj : ObjectExpression) : UIDef {
    assert(obj instanceof ObjectExpression);
    const data : any = {};
    for(const [key, value] of obj.properties.entries()){
        switch(key){
        case "type":
        case "name":
        case "label":
            data[key] = value.getString();
            break;
        case "obj":
            data[key] = getObj(value as Identifier);
            break;
        case "min":
        case "max":
        case "step":
        case "decimalPlaces":
            data[key] = value.getNumber();
            break;
        case "reset":
            data[key] = value.getBoolean();
            break;
        case "options":{
            assert(value instanceof ArrayExpression);
            data[key] = (value as ArrayExpression).elements.map(x => readOption(x as ObjectExpression))
            break;
        }
        case "resource":{
            data["resourceId"] = value.getString();
            break;
        }
        default:
            throw new MyError();
        }
    }

    switch(data.type){
    case "range" : return data as RangeDef;
    case "select": return data as SelectDef;
    case "label": return data as LabelDef;
    default      : throw new MyError();
    }
}

function readCanvases(obj : ObjectExpression) : CanvasDef {
    assert(obj instanceof ObjectExpression);
    const data : CanvasDef = {} as CanvasDef;

    for(const [key, value] of obj.properties.entries()){
        switch(key){
        case "id":
            data[key] = value.getString();
            break;
        case "width":
        case "height":
            data[key] = value.getNumber();
            break;
        default:
            throw new MyError();
        }
    }

    assert([data.id, data.width, data.height].every(x => x != undefined));
    return data;
}

function ObjectExprToSchemaDef(schemaObj : ObjectExpression) : ISimulationSchema{
    const schema : any = {};

    for(const [key, value] of schemaObj.properties.entries()){
        switch(key){
        case "name":
            schema[key] = value;
            break;
        case "structs":
            if(value instanceof ArrayExpression){
                schema[key] = value.elements;
            }
            else{
                throw new MyError();
            }
            break;
        case "resources":
            schema[key] = readResources(value as ObjectExpression);
            break;
        case "shaders":
            schema[key] = readShaders(value as ArrayExpression);
            break;
        case "uis":
            assert(value instanceof ArrayExpression);
            schema[key] = (value as ArrayExpression).elements.map(x => readUIs(x as ObjectExpression));
            break;
        case "canvases":
            assert(value instanceof ArrayExpression);
            schema[key] = (value as ArrayExpression).elements.map(x => readCanvases(x as ObjectExpression));
            break;
        case "script":
            schema[key] = value;
            break;
            
        default:
            throw new MyError(`skip property:${key}`);
        }
    }

    return schema as ISimulationSchema;
}


export function makeSimulationSchema(jsonText: string){
    // try {

        const k = jsonText.indexOf("//# sourceMappingURL=data:application/json;");
        if(k != -1){
            jsonText = jsonText.substring(0, k);
        }

        constValues.clear();

        const parser = new Parser(jsonText);
        const prg = parser.parse();

        const schemaVar = prg.varDecls.map(x => x.variable).find(x => x.name == "schema");
        if(schemaVar != undefined && schemaVar.init instanceof ObjectExpression){
            const schemaDef = ObjectExprToSchemaDef(schemaVar.init);

            const schema = new SimulationSchema(theDevice, schemaDef);
            ResolveVariableReferences(prg, schema);

            return schema;
        }
        else{

            throw new MyError();
        }

    // } catch (e) {
    //     throw new MyError();
    // }
}

export function ResolveVariableReferences(prg:Program, schema:SimulationSchema){
    const all : BaseASTNode[] = [];
    prg.getAll(all);
    const ids = all.filter(x => x instanceof Identifier && !x.isFieldReference()) as Identifier[];
    ids.filter(x => x.parent == null).forEach(x => msg(`no parent:${x.name}`));

    const resourceKeys = new Set<string>(schema.resources.keys());
    const shaderIds = new Set<string>(schema.shaders.map(x => x.id));
    const uniforms = schema.getUniforms().filter(x => x.obj != undefined);

    L:
    for(const id of ids){
        if(["execute", "copy", "range"].includes(id.name)){
            continue;
        }
        if(id.name == "Math" && id.parent instanceof MemberExpression){
            continue;
        }
        if(shaderIds.has(id.name) || resourceKeys.has(id.name)){
            continue;
        }

        const res = schema.resources.get(id.name);
        if(res != undefined){
            if(res instanceof UniformDef && res.obj != undefined){
                msg(`set uniform ref:${res.id}.${id.name}`);
                id.uniform = res;
            }
            continue;
        }

        const uniform = uniforms.find(x => x.obj!.name == id.name);
        if(uniform != undefined){
            msg(`set uniform obj ref:${uniform.id} ${id.name}`);
            id.uniform = uniform;
            continue;
        }

        for(let node = id.parent; node != null; node = node.parent){
            const va = node.getVariables().find(x => x.name == id.name);
            if(va != undefined){
                id.refVar = va;
                msg(`ref:${id.name} parent:${id.parent}`);
                continue L;
            }
        }

        throw new MyError();
    }
}