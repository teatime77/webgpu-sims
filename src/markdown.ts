// markdown_converter.ts
// Simple Markdown -> HTML converter.
// No external libraries.
// Supports:
// - headings
// - paragraphs
// - unordered / ordered lists
// - blockquotes
// - fenced code blocks
// - inline code
// - bold / italic
// - links
// - math text preservation for KaTeX
// - syntax highlighting for WGSL and TypeScript
//
// Ignored:
// - tables
// - images
// - diagrams

type TokenType =
    | "default"
    | "keyword"
    | "type"
    | "attribute"
    | "number"
    | "comment"
    | "bracket"
    | "string";

interface Token {
    type: TokenType;
    value: string;
}

const tokenClass: Record<TokenType, string> = {
    default: "md-token-default",
    keyword: "md-token-keyword",
    type: "md-token-type",
    attribute: "md-token-attribute",
    number: "md-token-number",
    comment: "md-token-comment",
    bracket: "md-token-bracket",
    string: "md-token-string",
};

export function markdownToHtml(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

    const html: string[] = [];
    let paragraphLines: string[] = [];
    let currentList: "ul" | "ol" | null = null;

    function flushParagraph(): void {
        if (paragraphLines.length === 0) return;

        const text = paragraphLines.join("\n").trim();
        if (text.length > 0) {
            html.push(`<p>${parseInlineMarkdown(text)}</p>`);
        }

        paragraphLines = [];
    }

    function closeList(): void {
        if (currentList !== null) {
            html.push(`</${currentList}>`);
            currentList = null;
        }
    }

    function openList(type: "ul" | "ol"): void {
        if (currentList === type) return;

        closeList();
        html.push(`<${type}>`);
        currentList = type;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Blank line
        if (trimmed === "") {
            flushParagraph();
            closeList();
            continue;
        }

        // Fenced code block
        const fenceMatch = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
        if (fenceMatch) {
            flushParagraph();
            closeList();

            const language = fenceMatch[1] || "";
            const codeLines: string[] = [];

            i++;
            while (i < lines.length && !lines[i].match(/^```\s*$/)) {
                codeLines.push(lines[i]);
                i++;
            }

            const code = codeLines.join("\n");
            html.push(renderCodeBlock(code, language));
            continue;
        }

        // Display math block: $$ ... $$
        if (trimmed.startsWith("$$")) {
            flushParagraph();
            closeList();

            const mathLines: string[] = [line];

            if (!trimmed.endsWith("$$") || trimmed === "$$") {
                i++;
                while (i < lines.length) {
                    mathLines.push(lines[i]);
                    if (lines[i].trim().endsWith("$$")) break;
                    i++;
                }
            }

            html.push(
                `<div class="md-math-block">${escapeHtml(mathLines.join("\n"))}</div>`
            );
            continue;
        }

        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            closeList();

            const level = headingMatch[1].length;
            const content = parseInlineMarkdown(headingMatch[2].trim());
            html.push(`<h${level}>${content}</h${level}>`);
            continue;
        }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            closeList();
            html.push("<hr>");
            continue;
        }

        // Blockquote
        if (line.startsWith(">")) {
            flushParagraph();
            closeList();

            const quoteLines: string[] = [];

            while (i < lines.length && lines[i].startsWith(">")) {
                quoteLines.push(lines[i].replace(/^>\s?/, ""));
                i++;
            }

            i--;

            const quoteHtml = markdownToHtml(quoteLines.join("\n"));
            html.push(`<blockquote>${quoteHtml}</blockquote>`);
            continue;
        }

        // Unordered list
        const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
        if (ulMatch) {
            flushParagraph();
            openList("ul");
            html.push(`<li>${parseInlineMarkdown(ulMatch[1].trim())}</li>`);
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (olMatch) {
            flushParagraph();
            openList("ol");
            html.push(`<li>${parseInlineMarkdown(olMatch[1].trim())}</li>`);
            continue;
        }

        // Normal paragraph line
        closeList();
        paragraphLines.push(line);
    }

    flushParagraph();
    closeList();

    return html.join("\n");
}

function renderCodeBlock(code: string, language: string): string {
    const normalizedLanguage = language.toLowerCase();

    let highlighted: string;

    if (normalizedLanguage === "wgsl") {
        highlighted = renderTokens(lexWGSL(code));
    } else if (
        normalizedLanguage === "ts" ||
        normalizedLanguage === "typescript"
    ) {
        highlighted = renderTokens(lexTypeScript(code));
    } else {
        highlighted = escapeHtml(code);
    }

    const langClass = normalizedLanguage
        ? ` language-${escapeAttr(normalizedLanguage)}`
        : "";

    return [
        `<pre class="md-code-block${langClass}">`,
        `<code>${highlighted}</code>`,
        `</pre>`,
    ].join("");
}

function renderTokens(tokens: Token[]): string {
    return tokens
        .map(token => {
            const cls = tokenClass[token.type] ?? tokenClass.default;
            return `<span class="${cls}">${escapeHtml(token.value)}</span>`;
        })
        .join("");
}

// Based on the WGSL lexer idea from editor.ts.
function lexWGSL(code: string): Token[] {
    const wgslRegex =
        /(?<blockComment>\/\*[\s\S]*?\*\/)|(?<lineComment>\/\/.*)|(?<attribute>@[a-zA-Z_]\w*)|(?<type>\b(?:f32|i32|u32|f16|bool|vec[234]|mat[234]x[234]|array|ptr|atomic|sampler|texture_2d|texture_storage_2d|texture_depth_2d)\b)|(?<keyword>\b(?:fn|let|var|const|return|struct|if|else|for|loop|while|break|continue|discard|override|enable|requires|alias)\b)|(?<number>\b\d+(\.\d+)?([eE][+-]?\d+)?[fiu]?\b)|(?<bracket>[()[\]{}])/g;

    return lexByRegex(code, wgslRegex);
}

function lexTypeScript(code: string): Token[] {
    const tsRegex =
        /(?<blockComment>\/\*[\s\S]*?\*\/)|(?<lineComment>\/\/.*)|(?<string>`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(?<attribute>@[a-zA-Z_]\w*)|(?<type>\b(?:string|number|boolean|bigint|symbol|void|null|undefined|unknown|never|any|object|Array|Record|Map|Set|Promise|HTMLElement|HTMLDivElement|HTMLCanvasElement|HTMLTextAreaElement|CanvasRenderingContext2D)\b)|(?<keyword>\b(?:import|export|from|as|type|interface|class|extends|implements|public|private|protected|readonly|static|new|function|return|const|let|var|if|else|for|of|in|while|do|switch|case|default|break|continue|try|catch|finally|throw|async|await|this|super|instanceof|typeof|keyof|infer|namespace|enum|declare)\b)|(?<number>\b(?:0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b)|(?<bracket>[()[\]{}])/g;

    return lexByRegex(code, tsRegex);
}

function lexByRegex(code: string, regex: RegExp): Token[] {
    const tokens: Token[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(code)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({
                type: "default",
                value: code.slice(lastIndex, match.index),
            });
        }

        const groups = match.groups;

        if (groups?.blockComment) {
            tokens.push({ type: "comment", value: groups.blockComment });
        } else if (groups?.lineComment) {
            tokens.push({ type: "comment", value: groups.lineComment });
        } else if (groups?.string) {
            tokens.push({ type: "string", value: groups.string });
        } else if (groups?.attribute) {
            tokens.push({ type: "attribute", value: groups.attribute });
        } else if (groups?.type) {
            tokens.push({ type: "type", value: groups.type });
        } else if (groups?.keyword) {
            tokens.push({ type: "keyword", value: groups.keyword });
        } else if (groups?.number) {
            tokens.push({ type: "number", value: groups.number });
        } else if (groups?.bracket) {
            tokens.push({ type: "bracket", value: groups.bracket });
        }

        lastIndex = regex.lastIndex;
    }

    if (lastIndex < code.length) {
        tokens.push({
            type: "default",
            value: code.slice(lastIndex),
        });
    }

    return tokens;
}

function parseInlineMarkdown(text: string): string {
    const protectedParts: string[] = [];

    function protect(html: string): string {
        const key = `\uE000${protectedParts.length}\uE000`;
        protectedParts.push(html);
        return key;
    }

    // Protect math first, because math often contains _, *, <, >, etc.
    text = protectMath(text, protect);

    // Protect inline code.
    text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
        return protect(`<code>${escapeHtml(code)}</code>`);
    });

    let html = escapeHtml(text);

    // Links: [label](url)
    html = html.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label: string, url: string) => {
            const safe = sanitizeUrl(url);

            if (safe === "") {
                return label;
            }

            return `<a href="${escapeAttr(safe)}">${label}</a>`;
        }
    );

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

    // Restore protected math/code.
    html = html.replace(/\uE000(\d+)\uE000/g, (_match, indexText: string) => {
        const index = Number(indexText);
        return protectedParts[index] ?? "";
    });

    return html;
}

function protectMath(
    text: string,
    protect: (html: string) => string
): string {
    let result = "";
    let i = 0;

    while (i < text.length) {
        const start = findNextMathStart(text, i);

        if (start === null) {
            result += text.slice(i);
            break;
        }

        result += text.slice(i, start.index);

        const endIndex = findMathEnd(text, start.index + start.open.length, start.close);

        if (endIndex === -1) {
            // No closing delimiter. Treat it as normal text.
            result += text.slice(start.index, start.index + start.open.length);
            i = start.index + start.open.length;
            continue;
        }

        const rawMath = text.slice(start.index, endIndex + start.close.length);
        const className =
            start.open === "$$" || start.open === "\\["
                ? "md-math-inline md-math-display-delimiter"
                : "md-math-inline";

        result += protect(`<span class="${className}">${escapeHtml(rawMath)}</span>`);
        i = endIndex + start.close.length;
    }

    return result;
}

function findNextMathStart(
    text: string,
    from: number
): { index: number; open: string; close: string } | null {
    let best: { index: number; open: string; close: string } | null = null;

    const candidates = [
        { open: "$$", close: "$$" },
        { open: "\\[", close: "\\]" },
        { open: "\\(", close: "\\)" },
        { open: "$", close: "$" },
    ];

    for (const candidate of candidates) {
        let index = text.indexOf(candidate.open, from);

        while (index !== -1 && isEscaped(text, index)) {
            index = text.indexOf(candidate.open, index + candidate.open.length);
        }

        if (index !== -1 && (best === null || index < best.index)) {
            best = {
                index,
                open: candidate.open,
                close: candidate.close,
            };
        }
    }

    return best;
}

function findMathEnd(text: string, from: number, close: string): number {
    let index = text.indexOf(close, from);

    while (index !== -1) {
        if (!isEscaped(text, index)) {
            return index;
        }

        index = text.indexOf(close, index + close.length);
    }

    return -1;
}

function isEscaped(text: string, index: number): boolean {
    let backslashCount = 0;
    let i = index - 1;

    while (i >= 0 && text[i] === "\\") {
        backslashCount++;
        i--;
    }

    return backslashCount % 2 === 1;
}

function escapeHtml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function escapeAttr(text: string): string {
    return escapeHtml(text);
}

function sanitizeUrl(url: string): string {
    const trimmed = url.trim();

    if (
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("./") ||
        trimmed.startsWith("../") ||
        trimmed.startsWith("/") ||
        trimmed.startsWith("#")
    ) {
        return trimmed;
    }

    return "";
}