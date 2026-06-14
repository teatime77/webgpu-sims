import { theSchema } from "./schema.js";
import { $, MyError } from "./utils.js";

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

const wgslEditors = new Map<string, SyntaxHighlightEditor>();

class SyntaxHighlightEditor {
    textarea : HTMLTextAreaElement;
    canvas   : HTMLCanvasElement;
    ctx      : CanvasRenderingContext2D;
    charWidth: number;

    constructor(div : HTMLDivElement){
        // 2. DOM ELEMENTS (with strict type assertions)
        this.textarea = Array.from(div.getElementsByTagName("textarea"))[0] as HTMLTextAreaElement;
        this.canvas = Array.from(div.getElementsByTagName("canvas"))[0] as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

        this.ctx.font = `${fontSize}px ${fontFamily}`;
        this.ctx.textBaseline = 'top';
        this.charWidth = this.ctx.measureText('M').width;

        // Use a ResizeObserver to watch the textarea container
        // This guarantees the canvas stays perfectly synced even if the user resizes the browser window
        const resizeObserver = new ResizeObserver(this.syncCanvasSize.bind(this));

        // Start watching the textarea
        resizeObserver.observe(this.textarea);

        // 6. EVENT BINDING
        this.textarea.addEventListener('input', this.render.bind(this));
        this.textarea.addEventListener('scroll', this.render.bind(this));

        // The initial render is now handled by the ResizeObserver firing on load, 
        // but it's safe to keep an explicit call just in case.
        this.syncCanvasSize();

        // Run the initial render
        this.render();    
    }

    // 7. HANDLE RESIZING & HIGH-DPI DISPLAYS
    syncCanvasSize(): void {
        // 1. Get the screen's pixel density (e.g., 2 on MacBooks, 1 on standard monitors)
        const dpr: number = window.devicePixelRatio || 1;

        // 2. Get the actual CSS pixel dimensions of the textarea
        const cssWidth: number = this.textarea.clientWidth;
        const cssHeight: number = this.textarea.clientHeight;

        // 3. Multiply the internal canvas resolution by the DPR for sharpness
        this.canvas.width = cssWidth * dpr;
        this.canvas.height = cssHeight * dpr;

        // 4. Force the CSS display size to match the original dimensions
        // (If we don't do this, the canvas will visually expand to double its size!)
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        // 5. Scale the drawing context
        // This is the magic trick: it means we DO NOT have to rewrite any of our 
        // render() loop math. 1 unit of math will now draw 2 physical pixels.
        this.ctx.scale(dpr, dpr);

        // 6. Reapply context settings (reset by canvas size change)
        this.ctx.font = `${fontSize}px ${fontFamily}`;
        this.ctx.textBaseline = 'top';

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
        // We clear using the CSS dimensions, because ctx.scale() multiplies it for us automatically
        this.ctx.clearRect(0, 0, this.textarea.clientWidth, this.textarea.clientHeight);

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

export function initSyntaxHighlightEditor(div : HTMLDivElement){
    return new SyntaxHighlightEditor(div);
}

function getNodeDivs(){
    const li = $("wgsl-li") as HTMLLIElement;

    return Array.from(li.children).filter(x => x instanceof HTMLDivElement 
        && x.dataset != undefined && x.dataset.nodeId != undefined) as HTMLDivElement[];
}

export function clearShaderEditors(){
    getNodeDivs().forEach(x => x.remove());
}

export function makeShaderEditors(){
    wgslEditors.clear();

    const li = $("wgsl-li") as HTMLLIElement;

    const nodeDivs = getNodeDivs();

    // Remove unused divs.
    nodeDivs.filter(x => ! theSchema.nodeMap.has(x.dataset.nodeId!)).forEach(x => x.remove());

    for(const [id, node] of theSchema.nodeMap.entries()){
        if(node.type != "compute" || nodeDivs.some(x => x.dataset.nodeId == id)){
            continue;
        }

        const nodeDiv = document.createElement("div");
        nodeDiv.dataset.nodeId = node.id

        const p = document.createElement("p");

        p.textContent = `compute shader for ${id}`;
        
        const editorDiv = document.createElement("div");
        const textarea = document.createElement("textarea");
        const canvas = document.createElement("canvas");

        if(node.nodeShaderCode == undefined){
            textarea.value = "";
        }
        else{
            textarea.value = node.nodeShaderCode;
        }

        editorDiv.className = "editor-container";
        
        textarea.className = "hidden-textarea";
        textarea.spellcheck= false;
        textarea.placeholder="Paste the final WGSL program codes here...";

        canvas.className = "render-canvas";
        canvas.width= 800;
        canvas.height= 400;

        editorDiv.append(textarea, canvas);

        nodeDiv.append(p, editorDiv);

        li.append(nodeDiv);

        initSyntaxHighlightEditor(editorDiv);
    }
}

export function setNodeShaderCode(){
    const nodeDivs = getNodeDivs();

    for(const node of theSchema.computeNodes()){
        const nodeDiv = nodeDivs.find(x => x.dataset.nodeId == node.id)
        if(nodeDiv == undefined){
            throw new MyError();
        }

        const textareas = Array.from(nodeDiv.getElementsByTagName("textarea")) ;
        if(textareas.length != 1){
            throw new MyError();
        }

        node.nodeShaderCode = textareas[0].value;
    }
}