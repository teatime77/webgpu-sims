import type { WgslFormat } from './UniformManager';
import type { NodeDef, SimulationSchema } from './SimulationRunner';
import { assert } from '../utils/CaptureTool';
import { theSchema } from '../../main';

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
    type!: 'uniform' | 'storage';

    constructor(){
    }
}

export class StorageDef extends ResourceDef {
    format?: WgslFormat;                 // for storage (e.g. vec4<f32>)
    elementByteSize?: number;            // for storage (custom structs: e.g. 32 bytes)
    count?: number;                      // for storage
    bufferCount?: number;                // for Ping-Pong

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

export class MeshDef {
    shape!: MeshShape;
    division?: number;
    count!: number;

    constructor(data : any){
        Object.assign(this, data)
    }
}

export function isMesh(obj: ResourceDef | MeshDef): obj is MeshDef {
    try{
        return (obj as MeshDef).shape !== undefined;
    }
    catch(e){
        throw new MyError();
    }
}

export function isUniform(obj: ResourceDef | MeshDef) : obj is ResourceDef {
    return ! isMesh(obj) && obj.type === 'uniform';
}

export function isRenderMesh(sim: SimulationSchema, node: NodeDef) : boolean {
    if(node.type == "render"){
        const mesh = node.bindings.map(b => sim.resources.get(b.resource)!).find(res => isMesh(res));
        return mesh != undefined;
    }

    return false;
}

export function getMeshFromNode(node: NodeDef) : MeshDef {
    assert(node.type == "render");
    const mesh = node.bindings.map(b => theSchema.resources.get(b.resource)!).find(res => isMesh(res))!;
    assert(mesh != undefined);

    return mesh;
}