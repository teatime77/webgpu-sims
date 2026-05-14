// src/core/engine/SimulationBase.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager, type WgslFormat } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';
import type { NodeDef, SimulationSchema } from './SimulationRunner';
import { assert } from '../utils/CaptureTool';
import { theSchema } from '../../main';
import { getElementSize } from './utils';

export interface ResourceDef {
    type: 'uniform' | 'storage';
    fields?: Record<string, WgslFormat>; // for uniform
    format?: WgslFormat;                 // for storage (e.g. vec4<f32>)
    elementByteSize?: number;            // for storage (custom structs: e.g. 32 bytes)
    count?: number;                      // for storage
    bufferCount?: number;                // for Ping-Pong
}

export type MeshShape = 'sphere' | 'tube';

export interface MeshDef {
    shape: MeshShape;
    division?: number;
    count: number;
}

export interface SphereDef extends MeshDef {
    count: number;
}

export function isMesh(obj: ResourceDef | MeshDef): obj is MeshDef {
    return (obj as MeshDef).shape !== undefined;
}

export function isUniform(obj: ResourceDef | MeshDef) : obj is ResourceDef {
    return ! isMesh(obj) && obj.type === 'uniform';
}

export function isRenderMesh(sim: SimulationSchema, node: NodeDef) : boolean {
    if(node.type == "render"){
        const mesh = node.bindings.map(b => sim.resources[b.resource]).find(res => isMesh(res));
        return mesh != undefined;
    }

    return false;
}

export function getMeshFromNode(node: NodeDef) : MeshDef {
    assert(node.type == "render");
    const mesh = node.bindings.map(b => theSchema.resources[b.resource]).find(res => isMesh(res))!;
    assert(mesh != undefined);

    return mesh;
}
