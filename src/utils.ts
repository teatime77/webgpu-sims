import { theRunner, type NodeDef } from './SimulationRunner';

export class MyError extends Error {
}
export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';
export type MeshShape = "sphere" | "tube" | "arrow";

const TUBE_STRIDE = 12;
const ARROW_STRIDE = 12;
const SPHERE_STRIDE = 8;

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

export function $dlg(id : string) : HTMLDialogElement {
    return $(id) as HTMLDialogElement;
}

export function $txt(id : string) : HTMLTextAreaElement {
    return $(id) as HTMLTextAreaElement;
}

export function showHtml(ele: HTMLElement){
    ele.style.display = "inline-block";    
}

export function hideHtml(ele: HTMLElement){
    ele.style.display = "none";
}

export async function fetchText(fileURL: string) {
    if(!fileURL.startsWith("http")){
        const url = document.location.href;
        const parser = new URL(url);
        fileURL = `${parser.origin}/${fileURL}`;
        msg(`fetch Text:${fileURL}`);
    }


    const response = await fetch(fileURL);
    const text = await response!.text();

    return text;
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
    case "sphere": return SPHERE_STRIDE;
    case "tube"  : return TUBE_STRIDE;
    case "arrow" : return ARROW_STRIDE;
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
}

export class StorageDef extends ResourceDef {
    format?: WgslFormat;                 // for storage (e.g. vec4<f32>)
    elementByteSize?: number;            // for storage (custom structs: e.g. 32 bytes)
    count?: number;                      // for storage
    meshRef? : string;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data)
    }
}


interface FieldDef {
    name  : string;
    offset: number;
    format: WgslFormat;
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
            this.fieldDefs.push({name, offset, format});

            offset += size;
        }

        // Round up total size to 16 byte boundary as well
        this.totalSize = Math.ceil(offset / 16) * 16;
    }

    getField(name : string) : FieldDef | undefined {
        return this.fieldDefs.find(x => x.name == name);
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

        theRunner.device.queue.writeBuffer(this.buffer, 0, arrayBuffer);
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

export function isRenderMesh(node: NodeDef) : boolean {
    if(node.type == "render"){
        const mesh = node.bindings.map(b => b.resourceDef!).find(res => res instanceof MeshDef);
        return mesh != undefined;
    }

    return false;
}
