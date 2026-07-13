let toastTimer : number | undefined;

export class MyError extends Error {
    constructor(text : string, title?:string){
        super(text);
        if(title == undefined){
            title = "Error occured!";
        }

        displayErrorDialog(title, text);
        msg(`stack:${this.stack}`);
    }
}

export let isStaticServer: boolean;
export let urlOrigin : string;
export let urlBase : string;
export let urlPathName : string;
export let urlHome : string;
export let urlHash : string;
export let urlParams : Map<string, string>;
export let thumbnailBlob : Blob | undefined;
export let errFlag : boolean = false;

export function getTypeName(obj: any): string {
    // 1. Check for undefined
    if (obj === undefined) {
        return "undefined";
    }
    else if (obj == null) {
        return "null";
    }

    else if (typeof obj === "object" && obj.constructor && obj.constructor !== Object) {
        // 2. Check for class instances
        // Must be an object, not null, have a constructor, and not be a plain Object
        return obj.constructor.name;
    }
    else {
        // 3. Otherwise return "any" (plain objects, primitives, null, etc.)
        return "any";

    }
}

export function clearErr(){
    errFlag = false;
}

export function clearThumbnailBlob(){
    thumbnailBlob = undefined;
}

export function assert(ok : boolean, text:string = ""){
    if(!ok){
        throw new MyError(text);
    }
}

export function msg(txt : string){
    console.log(txt);
}

export function logForAgent(txt : string){
    msg(txt);
}

export function range(n: number) : number[]{
    return [...Array(n).keys()];
}

const $dic = new Map<string, HTMLElement>();

export function $(id : string) : HTMLElement {
    let ele = $dic.get(id);
    if(ele == undefined){
        ele = document.getElementById(id)!;
        assert(ele != null);
        $dic.set(id, ele);
    }

    return ele;
}

export function $frm(id : string) : HTMLFormElement {
    return $(id) as HTMLFormElement;
}

export function $dlg(id : string) : HTMLDialogElement {
    return $(id) as HTMLDialogElement;
}

export function $div(id : string) : HTMLDivElement {
    return $(id) as HTMLDivElement;
}

export function $btn(id : string) : HTMLButtonElement {
    return $(id) as HTMLButtonElement;
}

export function $inp(id : string) : HTMLInputElement {
    return $(id) as HTMLInputElement;
}

export function $txt(id : string) : HTMLTextAreaElement {
    return $(id) as HTMLTextAreaElement;
}

export function $img(id : string) : HTMLImageElement {
    return $(id) as HTMLImageElement;
}

export function $canvas(id : string) : HTMLCanvasElement {
    return $(id) as HTMLCanvasElement;
}

export function $class(className : string) : HTMLElement[] {
    return Array.from(document.getElementsByClassName(className)) as HTMLElement[];
}

export function showHtml(ele: HTMLElement){
    ele.style.display = "inline-block";    
}

export function hideHtml(ele: HTMLElement){
    ele.style.display = "none";
}

export function parseURL(is_static_server : boolean): [string, string, Map<string, string>] {
    isStaticServer = is_static_server;

    msg(`url:${window.location.href}`);
    const url = document.location.href;
    const parser = new URL(url);
    urlOrigin = parser.origin;
    urlPathName = parser.pathname;
    assert(parser.origin + parser.pathname + parser.hash + parser.search == url);

    const k = parser.pathname.lastIndexOf("/");
    assert(k != -1);
    urlBase = urlOrigin + parser.pathname.substring(0, k);
    urlHash = parser.hash;
    msg(`origin:${urlOrigin} pathname:${urlPathName} hash:${urlHash} url-base: ${urlBase} `)

    const queryString = parser.search.substring(1);
    const queries = queryString.split("&");

    urlParams = new Map<string, string>();
    queries.forEach(query => {
        const [key, value] = query.split("=");
        urlParams.set(decodeURIComponent(key), decodeURIComponent(value));
    });

    if(isStaticServer){
        urlHome = urlOrigin + urlPathName;
    }
    else{
        urlHome = urlOrigin + "/";
    }

    return [ urlOrigin, parser.pathname, urlParams];
}

export async function fetchText(url: string) {
    let url2 = url.startsWith("http") ? url : `${urlHome}${url}`;

    const response = await fetch(url2);
    if(response.ok){
        const data = await response.text();

        return data;
    }
    else{
        throw new MyError(`fetch text:[${url == url2 ? url : url+"/"+url2}] ${response.statusText}`);
    }
}

export async function fetchJson(url : string) {
    let url2 = url.startsWith("http") ? url : `${urlHome}${url}`;

    const response = await fetch(url2);
    if(response.ok){
        const data = await response.json();

        return data;
    }
    else{
        throw new MyError(`fetch json error:[${url == url2 ? url : url+"/"+url2}] ${response.statusText}`);
    }
}

export async function sleep(milliseconds : number) : Promise<void> {
    return new Promise((resolve) => {
        setTimeout(()=>{
            resolve();
        }, milliseconds);
    });
}


/**
 * Copies a given string to the system clipboard.
 * @param textToCopy - The string you want to place in the clipboard.
 * @returns A promise that resolves when the text is successfully copied.
 */
export async function copyToClipboard(textToCopy: string): Promise<void> {
  try {
    // navigator.clipboard.writeText() takes a string and returns a Promise
    await navigator.clipboard.writeText(textToCopy);
    const ok_msg = "Text successfully copied to clipboard!";
    showToast(ok_msg, 2);
    logForAgent(ok_msg);
    
    // Optional: You could trigger a UI notification (toast) here
  } catch (error) {
    // This catch block runs if the browser denies permission
    console.error('Failed to copy text: ', error);
  }
}

export function showToast(text :string, timeout : number = 3){
    if(toastTimer != undefined){
        clearTimeout(toastTimer);
    }

    const toast = $dlg("toast-message");
    toast.textContent = text;
    toast.showModal();

    toastTimer = setTimeout(() => {
        toastTimer = undefined;
        toast.close();
    }, timeout * 1000);
}

export function generateTimestamp(): string {
  const now = new Date();

  // 1. Extract local date components
  const yy = String(now.getFullYear()).slice(-2); // Gets last 2 digits of year (e.g., '26')
  const mm = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed, add 1
  const dd = String(now.getDate()).padStart(2, '0');

  // 2. Extract local time components
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // 3. Assemble the string
  return `${yy}-${mm}-${dd}-${hh}-${min}-${ss}`;
}

/**
 * Triggers a browser download for a raw string as a local file.
 * @param content  The text or markdown string to download
 * @param filename The desired filename (e.g., 'document.md')
 */
export function downloadMarkdownFile(content: string): string {
    const filename = `markdown-${generateTimestamp()}.md`;

    // 1. Create a Blob with the markdown content and explicitly set the MIME type
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });

    // 2. Generate a temporary URL pointing to that Blob object
    const url = URL.createObjectURL(blob);

    // 3. Create an invisible anchor (<a>) element in memory
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // 4. Temporarily append to the DOM, trigger a programatic click, and clean up
    document.body.appendChild(link);
    link.click();
    
    // 5. Free up memory and remove the element
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return filename;
}


export function captureThumbnail(): void {
    const canvas = $("main-canvas") as HTMLCanvasElement;

    // 2. Create a temporary 2D canvas
    // const tempCanvas = $("temp-canvas") as HTMLCanvasElement
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    if(ctx == null){
        throw new MyError("Can not get Canvas Rendering Context2D");
    }

    // 3. Draw the WebGPU canvas onto the 2D canvas immediately
    ctx.drawImage(canvas, 0, 0);

    // 4. Capture the image from the 2D canvas
    tempCanvas.toBlob((blob) => {
        if(blob == null){
            throw new MyError("Can not make blob while capturing thumbnail.");
        }
        thumbnailBlob = blob;

        const imageUrl = URL.createObjectURL(blob);
        msg(`img-blob:[${imageUrl}]`);
        const img = $("thumbnail-img") as HTMLImageElement;

        // 1. Clean up the old blob URL if one exists
        if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }

        img.src = imageUrl;
    }, 'image/png');
}

/**
 * Extracts the specific line of WGSL code where an error occurred
 * and generates a visual pointer to the exact character.
 */
export function extractWGSLErrorContext(module: GPUShaderModule, wgslCode: string, msg: GPUCompilationMessage): string {
    // 1. Split the raw WGSL text into an array of individual lines
    const lines = wgslCode.split('\n');
    
    // WebGPU line numbers are 1-indexed, but arrays are 0-indexed
    const lineIndex = msg.lineNum - 1;
    
    // Safety check in case the line number is somehow out of bounds
    if (lineIndex < 0 || lineIndex >= lines.length) {
        return `[Line ${msg.lineNum}] ${msg.message}`;
    }

    const exactLine = lines[lineIndex];
    
    // 2. Create the visual caret pointer string (e.g., "       ^")
    // WebGPU positions are also 1-indexed. We use Math.max to prevent negative repeats.
    const spacesToIndent = Math.max(0, msg.linePos - 1);
    const pointerCaret = ' '.repeat(spacesToIndent) + '^';

    // 3. Format it cleanly for your UI or AI to read
    return `Error while parsing WGSL: :${msg.lineNum}:${msg.linePos} error: ${msg.message}
    ${exactLine}
    ${pointerCaret}

 - While calling [Device].CreateShaderModule([ShaderModuleDescriptor "${module.label}"]).`
}

export function displayErrorDialog(title: string, message: string) {
    errFlag = true;
    $("error-header").textContent = title;
    $div('error-message').textContent = message;
    $dlg('error-dialog').showModal();

    logForAgent("error occurred!")
}


/**
 * Extracts line information from a string based on a specific character index.
 * * @param text - The full multi-line string.
 * @param position - The 0-based index of the character position.
 * @returns line number, column number, line text
 */
export function getPositionInfo(text: string, position: number): [number, number, string] {
    // 1. Validate the position
    if (position < 0 || position > text.length) {
        throw new MyError("Position is out of bounds.");
    }

    // 2. Extract substring up to the target position
    const textUpToPosition = text.substring(0, position);

    // 3. Calculate line and column numbers
    const linesSoFar = textUpToPosition.split('\n');
    const lineNumber = linesSoFar.length;

    // The column is the length of the last line in our substring array + 1
    const columnNumber = linesSoFar[linesSoFar.length - 1].length + 1;

    // 4. Extract the full text of the current line
    const startOfLine = position - (columnNumber - 1);
    let endOfLine = text.indexOf('\n', position);

    // If there are no more newlines, the line ends at the end of the string
    if (endOfLine === -1) {
        endOfLine = text.length;
    }

    let lineText = text.substring(startOfLine, endOfLine);

    // Strip trailing carriage returns (\r) to properly handle Windows (\r\n) line breaks
    if (lineText.endsWith('\r')) {
        lineText = lineText.slice(0, -1);
    }

    return [
        lineNumber,
        columnNumber,
        lineText
    ];
}
