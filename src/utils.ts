import { theDevice } from './SimulationRunner.js';

export class MyError extends Error {
}
export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';
export type MeshShape = "sphere" | "tube" | "cylinder" | "arrow";
export type ShadingModel = 'triangle-color' | 'vertex-color' | 'vertex-color-normal';

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
        msg(`fetch Text:${fileURL}`);
    }


    const response = await fetch(fileURL);
    const text = await response!.text();

    return text;
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
    console.log(`Text successfully copied to clipboard!\n${textToCopy}`);
    
    // Optional: You could trigger a UI notification (toast) here
  } catch (error) {
    // This catch block runs if the browser denies permission
    console.error('Failed to copy text: ', error);
  }
}

export function showToast(btn : HTMLButtonElement, text :string){
    const toastMessage = $div('toast-message');
    toastMessage.textContent = text;

    // Get the exact dimensions and position of the button
    const rect = btn.getBoundingClientRect();

    // Set position to the bottom-left of the button
    // window.scrollY/X ensures it stays accurate even if the user has scrolled down the page
    toastMessage.style.left = `${rect.left + window.scrollX}px`;

    // rect.bottom is the bottom edge of the button. We add 10px for a small gap.
    toastMessage.style.top = `${rect.bottom + window.scrollY + 10}px`; 

    toastMessage.classList.add('show');

    setTimeout(() => {
        toastMessage.classList.remove('show');
    }, 3000);
}

function generateTimestamp(): string {
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

export function getElementSizeAlignment(format : string) : [number, number] {
    let alignment;
    let size;

    switch(format){
    case 'f32':
    case 'u32':
    case 'i32':
        size = 4; alignment = 4; 
        break;
    case 'vec2<f32>': 
        size = 8; alignment = 8; 
        break;
    case 'vec3<f32>': 
    case 'vec4<f32>': 
        size = 16; alignment = 16; 
        break;
    case 'mat4x4<f32>': 
        size = 64; alignment = 16; 
        break;
    default:
        throw new MyError();
    }

    return [size, alignment];
}

export function getElementSize(format : string) : number {
    const [size, _] = getElementSizeAlignment(format);
    return size;
}

export function getShapeStride(shape: MeshShape) : number {
    switch(shape){
    case "sphere": 
        return 8;
    case "tube"  :
    case "cylinder":
    case "arrow" :
        return 12;
    default:       throw new MyError();
    }
}

export abstract class ResourceDef {
    type!: 'uniform' | 'storage' | 'mesh';

    public id: string;
    public buffers!: GPUBuffer[];
    public bufferCount!: number;
    public currentIndex: number = 0;

    constructor(id: string){
        this.id = id;
    }

    /** historyLevel: 0 is the current write surface, 1 is the data from 1 step ago */
    getBuffer(historyLevel: number = 0): GPUBuffer {
        const n = this.bufferCount;
        const idx = (this.currentIndex + n - historyLevel) % n;
        return this.buffers[idx];
    }

    /** Rotate the ring at the end of the frame/step */
    swap(): void {
        this.currentIndex = (this.currentIndex + 1) % this.bufferCount;
    }

    destroyBuffers(){
        if(this.buffers != undefined){
            this.buffers.forEach(x => x.destroy());
        }
    }
}

export class StorageDef extends ResourceDef {
    format?: WgslFormat;                 // for storage (e.g. vec4<f32>)
    elementByteSize?: number;            // for storage (custom structs: e.g. 32 bytes)
    count?: number;                      // for storage
    meshRef? : string;
    topology?: GPUPrimitiveTopology;
    shadingModel? : ShadingModel;
    canvasId?: string;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data)
    }
}


interface FieldDef {
    name  : string;
    offset: number;
    format: WgslFormat;
    size  : number
}

export class UniformDef extends ResourceDef {
    fields?: Record<string, WgslFormat>; // for uniform
    fieldDefs: FieldDef[] = [];
    totalSize: number;
    buffer!: GPUBuffer;
    obj? : any;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data);

        if(this.fields == undefined){
            if(this.obj == undefined){
                throw new MyError();
            }

            this.fields = {};
            for (const [name, val] of Object.entries(this.obj)){
                assert(typeof val == "number");

                this.fields[name] = 'f32';
            }
        }

        let offset = 0;
        for (const [name, format] of Object.entries(this.fields)) {
            const [size, alignment] = getElementSizeAlignment(format);

            // Round up offset to alignment boundary (insert padding)
            offset = Math.ceil(offset / alignment) * alignment;
            this.fieldDefs.push({name, offset, format, size});

            offset += size;
        }

        // Round up total size to 16 byte boundary as well
        this.totalSize = Math.ceil(offset / 16) * 16;
    }

    initUniform(device: GPUDevice){
        this.buffer = device.createBuffer({
            label: `Uniform_${this.id}`,
            size: this.totalSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    /** Equivalent to updateVariables in V1: construct binary from JS object and transfer at once */
    update(obj : any) {
        const arrayBuffer = new ArrayBuffer(this.totalSize);
        const view = new DataView(arrayBuffer);

        for(const [name, val] of Object.entries(obj)) {
            const info = this.fieldDefs.find(x => x.name == name)!;
            assert(info != undefined);

            if(['f32', 'u32', 'i32'].includes(info.format)){
                assert(typeof val == "number");
            }
            
            if (info.format === 'f32') {
                view.setFloat32(info.offset, val as number, true); // true = little endian
            } else if (info.format === 'u32') {
                view.setUint32(info.offset, val as number, true);
            } else if (info.format === 'i32') {
                view.setInt32(info.offset, val as number, true);
            } else if (Array.isArray(val) || val instanceof Float32Array) {
                assert(Array.isArray(val) && val.every(x => typeof x == "number"));
                // Array writing for vec2, vec3, vec4, mat4x4 etc.
                for (let i = 0; i < val.length; i++) {
                    view.setFloat32(info.offset + i * 4, val[i], true);
                }
            }
        }

        theDevice.queue.writeBuffer(this.buffer, 0, arrayBuffer);
    }
}

export class MeshDef extends ResourceDef {
    shape!: MeshShape;
    division?: number;
    data!: Float32Array;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data)
        assert(this.type == 'mesh');
    }
}
