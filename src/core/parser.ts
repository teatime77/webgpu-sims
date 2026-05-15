// ============================================================================
// AST Node Classes
// ============================================================================

import { fetchText } from "./CaptureTool";

// ============================================================================
// Abstract Base Class
// ============================================================================
export abstract class BaseASTNode {
    // Forces every subclass to define its node type
    abstract readonly type: string;

    // Generates code back from the AST
    abstract toSource(): string;
}

// ============================================================================
// AST Node Classes (Compatible with erasableSyntaxOnly)
// ============================================================================

export class Program extends BaseASTNode {
    readonly type = 'Program';
    body: VariableDeclaration[];

    constructor(body: VariableDeclaration[]) {
        super();
        this.body = body;
    }

    toSource(): string {
        return this.body.map(decl => decl.toSource()).join('\n\n');
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

// ============================================================================
// Example Usage
// ============================================================================

// Manually constructing an AST to test the classes
const stateDeclaration = new VariableDeclaration(
    "state",
    new ObjectExpression([
        { key: "spinState", value: new Literal(0.0, 'number') },
        { key: "pinX", value: new UnaryExpression("-", new Literal(0.7, 'number')) }
    ])
);

const program = new Program([stateDeclaration]);

// Because we added the `toSource()` method, the AST can execute behavior:
console.log(program.toSource());
/* Output:
const state = {
    spinState: 0,
    pinX: -0.7
};
*/

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

        // Check for double-character punctuators first
        if (char === '*' && this.source[this.pos + 1] === '*') {
            this.pos += 2;
            return { type: 'Punctuator', value: '**', start, end: this.pos };
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

        // Numbers (Handles decimals)
        if (/[0-9]/.test(char)) {
            let numStr = '';
            while (this.pos < this.source.length && /[0-9\.]/.test(this.source[this.pos])) {
                numStr += this.source[this.pos];
                this.pos++;
            }
            return { type: 'Number', value: numStr, start, end: this.pos };
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
        const body: VariableDeclaration[] = [];
        while (this.peek().type !== 'EOF') {
            body.push(this.parseVariableDeclaration());
        }
        return new Program(body);
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

        return new VariableDeclaration(nameToken.value, init, typeAnnotation);
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

        // Handle Parentheses for Math Groupings e.g. (1 + 2) * 3
        if (token.type === 'Punctuator' && token.value === '(') {
            this.consume('(');
            const expr = this.parseExpression();
            this.consume(')');
            return new GroupExpression(expr);
        }

        // Handle Unary Minus (e.g., -0.7)
        if (token.type === 'Punctuator' && token.value === '-') {
            this.consume('-');
            const argument = this.parsePrimary();
            return new UnaryExpression('-', argument);
        }

        // Handle Objects
        if (token.type === 'Punctuator' && token.value === '{') {
            return this.parseObject();
        }

        // Handle Arrays
        if (token.type === 'Punctuator' && token.value === '[') {
            return this.parseArray();
        }

        // Handle Functions (Reads body as raw string)
        if (token.type === 'Keyword' && token.value === 'function') {
            return this.parseFunction();
        }

        // Primitives & Identifiers
        if (token.type === 'String') {
            this.consume();
            return new Literal(token.value, 'string');
        }

        if (token.type === 'Number') {
            this.consume();
            return new Literal(parseFloat(token.value), 'number');
        }

        if (token.type === 'Keyword' && (token.value === 'true' || token.value === 'false')) {
            this.consume();
            return new Literal(token.value === 'true', 'boolean');
        }

        if (token.type === 'Identifier') {
            this.consume();
            return new Identifier(token.value);
        }

        throw new Error(`Unexpected token '${token.value}' at index ${token.start}`);
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

export async function testParser(){
    const text = await fetchText("./tmp/test.js");
    const parser = new Parser(text);
    const prg = parser.parse();
    // msg(`${"-".repeat(50)}\n${prg.toSource()}\n${"-".repeat(50)}`);
}