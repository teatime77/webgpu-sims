import type { WgslFormat } from './UniformManager';
import type { NodeDef, SimulationSchema } from './SimulationRunner';
import { assert } from './CaptureTool';

export class MyError extends Error {
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

export class UniformDef extends ResourceDef {
    fields?: Record<string, WgslFormat>; // for uniform

    constructor(data : any){
        super();
        Object.assign(this, data)
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

export function isUniform(obj: ResourceDef) : obj is ResourceDef {
    return ! (obj instanceof MeshDef) && obj.type === 'uniform';
}

export function isRenderMesh(sim: SimulationSchema, node: NodeDef) : boolean {
    if(node.type == "render"){
        const mesh = node.bindings.map(b => b.resourceDef!).find(res => res instanceof MeshDef);
        return mesh != undefined;
    }

    return false;
}
