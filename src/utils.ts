let toastTimer : number | undefined;

export class MyError extends Error {
}

export let urlBase : string;
export let thumbnailBlob : Blob;

export function assert(ok : boolean){
    if(!ok){
        throw new MyError();
    }
}

export function msg(txt : string){
    console.log(txt);
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

export function showHtml(ele: HTMLElement){
    ele.style.display = "inline-block";    
}

export function hideHtml(ele: HTMLElement){
    ele.style.display = "none";
}

export function parseURL(): [string, string, Map<string, string>] {
    const url = document.location.href;
    const parser = new URL(url);
    assert(parser.origin + parser.pathname + parser.search == url);

    const k = parser.pathname.lastIndexOf("/");
    assert(k != -1);
    urlBase = parser.origin + parser.pathname.substring(0, k);
    msg(`origin:${parser.origin} pathname:${parser.pathname} url-base: ${urlBase}`)

    const queryString = parser.search.substring(1);
    const queries = queryString.split("&");

    const params = new Map<string, string>();
    queries.forEach(query => {
        const [key, value] = query.split("=");
        params.set(decodeURIComponent(key), decodeURIComponent(value));
    });
        
    return [ parser.origin, parser.pathname, params];
}

export async function fetchText(fileURL: string) {
    if(!fileURL.startsWith("http")){
        fileURL = `${urlBase}/${fileURL}`;
        // msg(`fetch Text:${fileURL}`);
    }


    const response = await fetch(fileURL);
    const text = await response!.text();

    return text;
}

export async function fetchTextResponse(fileURL: string) : Promise<string | Response> {
    const response = await fetch(fileURL);
    if(response.ok){
        const text = await response!.text();

        return text;
    }
    else{
        return response;
    }
}

export async function fetchJson(url : string) {
    const resp = await fetchTextResponse(url);
    if(resp instanceof Response){
        msg(`fetch json error:${resp.statusText}`);
        return undefined;
    }
    else{
        const obj  = JSON.parse(resp);
        return obj;
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
    msg(`Text successfully copied to clipboard!\n`);
    
    // Optional: You could trigger a UI notification (toast) here
  } catch (error) {
    // This catch block runs if the browser denies permission
    console.error('Failed to copy text: ', error);
  }
}

export function showToast(text :string, timeout : number = 3, btn? : HTMLButtonElement){
    if(toastTimer != undefined){
        clearTimeout(toastTimer);
    }

    const toastMessage = $div('toast-message');
    toastMessage.textContent = text;

    let x : number;
    let y : number;

    if(btn != undefined){
        // Get the exact dimensions and position of the button
        const rect = btn.getBoundingClientRect();
        x = rect.left + window.scrollX;
        y = rect.bottom + window.scrollY + 10;
    }
    else{
        const clientWidth = document.documentElement.clientWidth;
        const clientHeight = document.documentElement.clientHeight;

        x = clientWidth / 2;
        y = clientHeight / 2;
    }

    // Set position to the bottom-left of the button
    // window.scrollY/X ensures it stays accurate even if the user has scrolled down the page
    toastMessage.style.left = `${x}px`;

    // rect.bottom is the bottom edge of the button. We add 10px for a small gap.
    toastMessage.style.top = `${y}px`; 

    toastMessage.classList.add('show');

    toastTimer = setTimeout(() => {
        toastTimer = undefined;
        toastMessage.classList.remove('show');
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
        throw new MyError();
    }

    // 3. Draw the WebGPU canvas onto the 2D canvas immediately
    ctx.drawImage(canvas, 0, 0);

    // 4. Capture the image from the 2D canvas
    tempCanvas.toBlob((blob) => {
        if(blob == null){
            throw new MyError();
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
