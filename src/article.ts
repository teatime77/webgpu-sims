import { $, $div } from "./utils";
import { marked } from 'marked';
import renderMathInElement from 'katex/contrib/auto-render';
import mermaid from 'mermaid';
import { initSyntaxHighlightEditor } from "./editor";

let textarea : HTMLTextAreaElement;
let previewDiv : HTMLDivElement;

// 6. THE PREVIEW ENGINE (DOM/HTML)
async function updatePreview(): Promise<void> {
  const rawMarkdown = textarea.value;

  // Step 1: Parse Markdown to HTML
  // Note: Depending on your marked setup, you might need to sanitize this.
  const htmlResult = await marked.parse(rawMarkdown);
  previewDiv.innerHTML = htmlResult;

  // Step 2: Render Mathematical Formulas (KaTeX)
  // This targets $$ block $$ and $ inline $ math
  renderMathInElement(previewDiv, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false }
    ],
    throwOnError: false // Prevents live-typing from crashing the renderer
  });

  // Step 3: Render Mermaid Diagrams
  // Find all code blocks that marked tagged as 'language-mermaid'
  const mermaidNodes = previewDiv.querySelectorAll<HTMLElement>('code.language-mermaid');
  if (mermaidNodes.length > 0) {
    try {
      // Mermaid requires the elements to be in the DOM to render correctly
      await mermaid.run({ nodes: Array.from(mermaidNodes) });
    } catch (error) {
      // Silently catch syntax errors while the user is actively typing a diagram
      console.warn("Mermaid syntax incomplete/typing...", error);
    }
  }

//   const rc1 = textarea.getBoundingClientRect();
//   const rc2 = previewDiv.getBoundingClientRect();
//   if(rc1.height < rc2.height){
//         textarea.style.height = `${rc2.height}px`;
//   }
}

export function initArticle(){
    initSyntaxHighlightEditor("markdown-editor");

    textarea = $("markdown-text") as HTMLTextAreaElement;
    previewDiv = $div("markdown-preview");

    // Initialize Mermaid
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });

    textarea.addEventListener('input', updatePreview);

    // Run the initial render pipelines
    updatePreview();
}
