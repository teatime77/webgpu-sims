// 1. TYPES & INTERFACES

import { $, $div } from "./utils";

// Define exactly what types of tokens our lexer is allowed to produce
type TokenType = 'default' | 'keyword' | 'type' | 'attribute' | 'number' | 'comment' | 'bracket';

interface Token {
  type: TokenType;
  value: string;
}

// 3. GRID & THEME CONFIGURATION
const fontSize: number = 16;
const fontFamily: string = "'Consolas', 'Courier New', monospace";
const lineHeight: number = 24;
const padding: number = 15;

// TypeScript forces us to provide a color for every TokenType
const theme: Record<TokenType, string> = {
  default: '#d4d4d4',
  keyword: '#569cd6',   
  type: '#4ec9b0',      
  attribute: '#c586c0', 
  number: '#b5cea8',    
  comment: '#6a9955',   
  bracket: '#ffd700'    
};

class SyntaxHighlightEditor {
    textarea : HTMLTextAreaElement;
    canvas   : HTMLCanvasElement;
    ctx      : CanvasRenderingContext2D;
    charWidth: number;

    constructor(editorId: string){
        const div = $div(editorId);

        // 2. DOM ELEMENTS (with strict type assertions)
        this.textarea = Array.from(div.getElementsByTagName("textarea"))[0] as HTMLTextAreaElement;
        this.canvas = Array.from(div.getElementsByTagName("canvas"))[0] as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

        this.ctx.font = `${fontSize}px ${fontFamily}`;
        this.ctx.textBaseline = 'top';
        this.charWidth = this.ctx.measureText('M').width;

        // 6. EVENT BINDING
        this.textarea.addEventListener('input', this.render.bind(this));
        this.textarea.addEventListener('scroll', this.render.bind(this));

        // Run the initial render
        this.render();    
    }

    // 4. THE WGSL LEXER
    lexWGSL(code: string): Token[] {
        const wgslRegex = /(?<blockComment>\/\*[\s\S]*?\*\/)|(?<lineComment>\/\/.*)|(?<attribute>@[a-zA-Z_]\w*)|(?<type>\b(?:f32|i32|u32|f16|bool|vec[234]|mat[234]x[234]|array|ptr|atomic|sampler|texture_2d)\b)|(?<keyword>\b(?:fn|let|var|const|return|struct|if|else|for|loop|while|break|continue|discard|override)\b)|(?<number>\b\d+(\.\d+)?([eE][+-]?\d+)?f?\b)|(?<bracket>[()[\]{}])/g;

        const tokens: Token[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = wgslRegex.exec(code)) !== null) {
            // Capture unstyled text before the match
            if (match.index > lastIndex) {
            tokens.push({ type: 'default', value: code.slice(lastIndex, match.index) });
            }

            // Safely access match groups in TypeScript
            const groups = match.groups;
            if (groups) {
            if (groups.blockComment) tokens.push({ type: 'comment', value: groups.blockComment });
            else if (groups.lineComment) tokens.push({ type: 'comment', value: groups.lineComment });
            else if (groups.attribute) tokens.push({ type: 'attribute', value: groups.attribute });
            else if (groups.type) tokens.push({ type: 'type', value: groups.type });
            else if (groups.keyword) tokens.push({ type: 'keyword', value: groups.keyword });
            else if (groups.number) tokens.push({ type: 'number', value: groups.number });
            else if (groups.bracket) tokens.push({ type: 'bracket', value: groups.bracket });
            }

            lastIndex = wgslRegex.lastIndex;
        }

        // Capture any remaining text at the end of the file
        if (lastIndex < code.length) {
            tokens.push({ type: 'default', value: code.slice(lastIndex) });
        }

        return tokens;
    }

    // 5. THE RENDER LOOP
    render(): void {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const scrollX: number = this.textarea.scrollLeft;
        const scrollY: number = this.textarea.scrollTop;
        
        const tokens = this.lexWGSL(this.textarea.value);

        let row = 0;
        let col = 0;

        for (const token of tokens) {
            this.ctx.fillStyle = theme[token.type] || theme.default;

            const lines = token.value.split('\n');

            for (let i = 0; i < lines.length; i++) {
            const textPart = lines[i];

            if (textPart.length > 0) {
                const x = padding + (col * this.charWidth) - scrollX;
                const y = padding + (row * lineHeight) - scrollY;

                // Performance Culling
                if (y >= -lineHeight && y <= this.canvas.height) {
                this.ctx.fillText(textPart, x, y);
                }
                
                col += textPart.length;
            }

            if (i < lines.length - 1) {
                row++;     
                col = 0;   
            }
            }
        }
    }
}

export function initSyntaxHighlightEditor(){
    const schemaEditor = new SyntaxHighlightEditor("schema-editor");
    const wgslEditor = new SyntaxHighlightEditor("wgsl-editor");
}
