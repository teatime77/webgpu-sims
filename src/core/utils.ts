import { theRunner, type NodeDef, type SimulationSchema } from './SimulationRunner';
import { assert } from './CaptureTool';

export class MyError extends Error {
}
export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';

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

export abstract class ResourceDef {
    type!: 'uniform' | 'storage' | 'mesh';

    public id!: string;
    public buffers!: GPUBuffer[];
    public bufferCount!: number;
    public currentIndex: number = 0;
    mesh?: MeshDef;

    constructor(){
    }

    initResource(id: string, buffers: GPUBuffer[], bufferCount: number, mesh?: MeshDef) {
        // Assign inside constructor
        this.id = id;
        this.buffers = buffers;
        if(this.bufferCount == undefined){
            this.bufferCount = bufferCount;
        }
        else{
            assert(this.bufferCount == bufferCount);
        }
        this.mesh = mesh;
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

    constructor(data : any){
        super();
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

    constructor(data : any){
        super();
        Object.assign(this, data);

        let offset = 0;
        for (const [name, format] of Object.entries(this.fields!)) {
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

export type MeshShape = 'sphere' | 'tube';

export class MeshDef extends ResourceDef {
    shape!: MeshShape;
    division?: number;
    count!: number;

    constructor(data : any){
        super();
        Object.assign(this, data)
        assert(this.type == 'mesh');
    }
}

export function isRenderMesh(sim: SimulationSchema, node: NodeDef) : boolean {
    if(node.type == "render"){
        const mesh = node.bindings.map(b => b.resourceDef!).find(res => res instanceof MeshDef);
        return mesh != undefined;
    }

    return false;
}
