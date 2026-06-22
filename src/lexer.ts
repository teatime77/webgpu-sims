
// ============================================================================
// 2. Lexical Analyzer (Tokenizer)

import { assert } from "./utils.js";

// ============================================================================
export type TokenType = 'Keyword' | 'Identifier' | 'Number' | 'String' | 'Punctuator' | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    line : number;
    start: number;
    end: number;
}

export class Lexer {
    private pos: number = 0;
    private source: string;
    tokens : Token[] = [];
    private tokenPos = 0;
    private linePos = 0;

    constructor(source: string) {
        this.source = source;
        while(true){
            const token = this.readToken();
            this.tokens.push(token);
            if(token.type == "EOF"){
                break;
            }
        }
    }

    private skipWhitespaceAndComments() {
        while (this.pos < this.source.length) {
            const char = this.source[this.pos];
            if(char == "\n"){
                this.linePos++;
            }
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

    private readToken(): Token {
        this.skipWhitespaceAndComments();

        if (this.pos >= this.source.length) {
            return { type: 'EOF', value: '', start: this.pos, end: this.pos, line:this.linePos };
        }

        const start = this.pos;
        const char = this.source[this.pos];
        const nextChar = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : `\0`;
        const doubleChar = char + nextChar;

        if([ "**", "=>", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=" ].includes(doubleChar)){
            this.pos += 2;
            return { type: 'Punctuator', value: doubleChar, start, end: this.pos, line:this.linePos };
        }

        // Numbers (Handles decimals)
        if (/[0-9]/.test(char) || char == '.' && /[0-9]/.test(nextChar)) {
            let numStr = '';
            while (this.pos < this.source.length && /[0-9\.e]/.test(this.source[this.pos])) {
                numStr += this.source[this.pos];
                this.pos++;

                if(this.source[this.pos - 1] == "e" && this.pos < this.source.length && this.source[this.pos] == "-"){
                    numStr += this.source[this.pos];
                    this.pos++;
                }
            }
            return { type: 'Number', value: numStr, start, end: this.pos, line:this.linePos };
        }

        // Punctuators (Added +, /, %, and simplified the regex)
        if (/[{}\[\]()<>:=,.\*;\-+/%`]/.test(char)) {
            this.pos++;
            return { type: 'Punctuator', value: char, start, end: this.pos, line:this.linePos };
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
            return { type: 'String', value: str, start, end: this.pos, line:this.linePos };
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
                return { type: 'Keyword', value: idStr, start, end: this.pos, line:this.linePos };
            }

            return { type: 'Identifier', value: idStr, start, end: this.pos, line:this.linePos };
        }

        throw new Error(`Unexpected character '${char}' at index ${this.pos}`);
    }

    public nextToken() : Token {
        assert(this.tokenPos < this.tokens.length);
        const token = this.tokens[this.tokenPos];
        this.tokenPos++;

        return token;
    }

    public peekTexts(n : number) : string {
        const tokens = this.tokens.slice(this.tokenPos, this.tokenPos + n);
        return tokens.map(x => x.value).join("");
    }
}
