// ============================================================================
// AST Node Classes
// ============================================================================

import { msg, assert, fetchText, MyError } from "./utils";
import type { ButtonDef, ISimulationSchema, RangeDef, SelectDef, UIDef } from "./SimulationRunner";

type ValueType = number | number[] | Record<string, any> | Record<string, any>[] | boolean | string;

const constValues = new Map<string, ValueType>();

// ============================================================================
// Abstract Base Class
// ============================================================================
export abstract class BaseASTNode {
    // Forces every subclass to define its node type
    abstract readonly type: string;

    // Generates code back from the AST
    abstract toSource(): string;

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
}

export class FunctionExpression extends BaseASTNode {
    readonly type = 'FunctionExpression';
    rawBody: string;

    constructor(rawBody: string) {
        super();
        this.rawBody = rawBody;
    }

    toSource(): string {
        return this.rawBody;
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
                    }
                }
            }
        }

        throw new MyError();
    }
}

// ============================================================================
// 2. Lexical Analyzer (Tokenizer)
// ============================================================================
type TokenType = 'Keyword' | 'Identifier' | 'Number' | 'String' | 'Punctuator' | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    start: number;
    end: number;
}

export class Lexer {
    private pos: number = 0;
    source: string;

    constructor(source: string) {
        this.source = source;
    }

    private skipWhitespaceAndComments() {
        while (this.pos < this.source.length) {
            const char = this.source[this.pos];
            if (/\s/.test(char)) {
                this.pos++;
            } else if (char === '/' && this.source[this.pos + 1] === '/') {
                // Skip single-line comment
                while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
                    this.pos++;
                }
            } else {
                break;
            }
        }
    }

    public nextToken(): Token {
        this.skipWhitespaceAndComments();

        if (this.pos >= this.source.length) {
            return { type: 'EOF', value: '', start: this.pos, end: this.pos };
        }

        const start = this.pos;
        const char = this.source[this.pos];
        const nextChar = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : `\0`;

        // Check for double-character punctuators first
        if (char === '*' && this.source[this.pos + 1] === '*') {
            this.pos += 2;
            return { type: 'Punctuator', value: '**', start, end: this.pos };
        }

        // Numbers (Handles decimals)
        if (/[0-9]/.test(char) || char == '.' && /[0-9]/.test(nextChar)) {
            let numStr = '';
            while (this.pos < this.source.length && /[0-9\.]/.test(this.source[this.pos])) {
                numStr += this.source[this.pos];
                this.pos++;
            }
            return { type: 'Number', value: numStr, start, end: this.pos };
        }

        // Punctuators (Added +, /, %, and simplified the regex)
        if (/[{}\[\]():=,.\*;\-+/%]/.test(char)) {
            this.pos++;
            return { type: 'Punctuator', value: char, start, end: this.pos };
        }

        // Strings
        if (char === '"' || char === "'") {
            const quote = char;
            this.pos++;
            let str = '';
            while (this.pos < this.source.length && this.source[this.pos] !== quote) {
                if (this.source[this.pos] === '\\') {
                    this.pos++; // Skip escape character
                }
                str += this.source[this.pos];
                this.pos++;
            }
            this.pos++; // Skip closing quote
            return { type: 'String', value: str, start, end: this.pos };
        }

        // Identifiers and Keywords
        if (/[a-zA-Z_]/.test(char)) {
            let idStr = '';
            while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.pos])) {
                idStr += this.source[this.pos];
                this.pos++;
            }

            const keywords = ['const', 'function', 'true', 'false'];
            if (keywords.includes(idStr)) {
                return { type: 'Keyword', value: idStr, start, end: this.pos };
            }

            return { type: 'Identifier', value: idStr, start, end: this.pos };
        }

        throw new Error(`Unexpected character '${char}' at index ${this.pos}`);
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
    }

    private advance() {
        this.currentToken = this.lexer.nextToken();
        // msg(`token:${this.currentToken.value} ${this.currentToken.type}`);
    }

    private peek(): Token {
        return this.currentToken;
    }

    private consume(expectedValue?: string): Token {
        const token = this.currentToken;
        if (expectedValue && token.value !== expectedValue) {
            throw new Error(`Expected '${expectedValue}' but found '${token.value}' at index ${token.start}`);
        }
        this.advance();
        return token;
    }

    public parse(): Program {
        const body = new Map<string, VariableDeclaration>();
        while (this.peek().type !== 'EOF') {
            switch(this.currentToken.value){
            case "import":
            case "export":
                this.parseImportExport();
                break;
            case "const":{
                const va = this.parseVariableDeclaration();
                body.set(va.name, va);
                break;

            }
            default:
                throw new MyError();
            }
        }
        return new Program(body);
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

    private parseVariableDeclaration(): VariableDeclaration {
        this.consume('const'); // Expect const
        
        const nameToken = this.consume();
        if (nameToken.type !== 'Identifier') throw new Error(`Expected Identifier after const`);

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
        constValues.set(va.name, value);

        return va;
    }

    public parseExpression(): BaseASTNode {
        return this.parseAdditive();
    }

    // 1. Level: + and - (Left Associative)
    private parseAdditive(): BaseASTNode {
        let left = this.parseMultiplicative();
        
        while (this.peek().value === '+' || this.peek().value === '-') {
            const operator = this.consume().value;
            const right = this.parseMultiplicative();
            left = new BinaryExpression(left, operator, right);
        }
        
        return left;
    }

    // 2. Level: *, /, and % (Left Associative)
    private parseMultiplicative(): BaseASTNode {
        let left = this.parseExponentiation();
        
        while (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%') {
            const operator = this.consume().value;
            const right = this.parseExponentiation();
            left = new BinaryExpression(left, operator, right);
        }
        
        return left;
    }

    // 3. Level: ** (Right Associative)
    private parseExponentiation(): BaseASTNode {
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
    private parsePrimary(): BaseASTNode {
        const token = this.peek();
        let node: BaseASTNode;

        // Handle Parentheses for Math Groupings e.g. (1 + 2) * 3
        if (token.type === 'Punctuator' && token.value === '(') {
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
            throw new Error(`Unexpected token '${token.value}' at index ${token.start}`);
        }

        // Handle trailing property accesses and method calls
        while (true) {
            if (this.peek().value === '.') {
                this.consume('.');
                const propToken = this.consume();
                if (propToken.type !== 'Identifier') {
                    throw new Error(`Expected Identifier after '.' at index ${propToken.start}`);
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

    private parseObject(): ObjectExpression {
        const properties = [];
        this.consume('{');

        while (this.peek().value !== '}') {
            const keyToken = this.consume();
            const key = keyToken.value;
            
            this.consume(':');
            const value = this.parseExpression();
            properties.push({ key, value });

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

    private parseFunction(): FunctionExpression {
        const startToken = this.consume('function');
        
        // Skip '*' if it's a generator function
        if (this.peek().value === '*') this.consume('*');
        
        this.consume('(');
        
        // Skip arguments until closing parens
        while (this.peek().value !== ')') {
            this.advance();
        }
        this.consume(')');

        // We capture the body as raw text by keeping track of brace depth
        this.consume('{');
        let braceCount = 1;
        
        while (braceCount > 0 && this.peek().type !== 'EOF') {
            const t = this.consume();
            if (t.value === '{') braceCount++;
            if (t.value === '}') braceCount--;
        }

        // We extract the raw source based on the initial start token up to the current position
        const endPosition = this.currentToken.start; // The last '}' consumed
        const rawBody = this.source.substring(startToken.start, endPosition);

        return new FunctionExpression(rawBody);
    }
}

function getObj(value : Identifier){
    assert(value instanceof Identifier);
    const obj = constValues.get(value.name);
    assert(typeof obj == "object");
    return obj;
}

function readResource(resourceObj:ObjectExpression) {
    assert(resourceObj instanceof ObjectExpression);

    const data : any = {};

    for(const {key, value} of resourceObj.properties){
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
        default:
            throw new MyError();
        }
    }

    return data;
}

function readResources(resourceObj:ObjectExpression){
    assert(resourceObj instanceof ObjectExpression);
    const data : any = {};
    for(const {key, value} of resourceObj.properties){
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
        for(const {key, value} of shaderObj.properties){
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
    for(const {key, value} of obj.properties){
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
    for(const {key, value} of obj.properties){
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
        default:
            throw new MyError();
        }
    }

    switch(data.type){
    case "range" : return data as RangeDef;
    case "select": return data as SelectDef;
    case "button": return data as ButtonDef;
    default      : throw new MyError();
    }
}

function makeSchema(schemaObj : ObjectExpression) : ISimulationSchema{
    const schema : any = {};

    for(const {key, value} of schemaObj.properties){
        switch(key){
        case "name":
            schema[key] = value;
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
        default:
            msg(`skip property:${key}`);
            break;
        }
    }

    return schema as ISimulationSchema;
}

export async function parseSchema(text : string) : Promise<ISimulationSchema> {
    constValues.clear();

    const parser = new Parser(text);
    const prg = parser.parse();
    msg(`${"-".repeat(50)}\n${prg.toSource()}\n${"-".repeat(50)}`);

    const schemaVar = prg.variables().find(x => x.typeAnnotation == "SimulationSchema");
    if(schemaVar != undefined && schemaVar.init instanceof ObjectExpression){
        const schema = makeSchema(schemaVar.init);
        msg(`${"=".repeat(50)} \n ${JSON.stringify(schema, null, 4)} ${"=".repeat(50)}`);

        return schema;
    }

    throw new MyError();
}
