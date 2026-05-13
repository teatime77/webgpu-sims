// src/core/engine/SimulationBase.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager, type WgslFormat } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';

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

export abstract class SimulationBase {
    protected engine!: WebGPUEngine;
    protected uniforms!: UniformManager;
    protected storages = new Map<string, ResourceWrapper>();

    // Resource blueprint declared in subclass
    abstract defineResources(): Record<string, ResourceDef>;

    // Called during engine initialization
    async initResources(engine: WebGPUEngine) {
        this.engine = engine;
        this.uniforms = new UniformManager(engine.device);
        
        const defs = this.defineResources();

        for (const [id, def] of Object.entries(defs)) {
            if (def.type === 'uniform') {
                this.uniforms.register(id, def.fields!);
            } 
            else if (def.type === 'storage') {
                const count = def.bufferCount || 1;
                const buffers: GPUBuffer[] = [];

                // Calculate byte size of one element from format
                let elementSize = def.elementByteSize || 4; 
                if (!def.elementByteSize) {
                    if (def.format === 'vec2<f32>') elementSize = 8;
                    else if (def.format === 'vec3<f32>' || def.format === 'vec4<f32>') elementSize = 16;
                    else if (def.format === 'mat4x4<f32>') elementSize = 64;
                }
                const byteSize = elementSize * (def.count || 1);

                for (let i = 0; i < count; i++) {
                    buffers.push(engine.device.createBuffer({
                        label: `Storage_${id}_${i}`,
                        size: byteSize,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
                    }));
                }
                this.storages.set(id, new ResourceWrapper(id, buffers, count));
            }
        }
    }

    /** Get GPUBuffer from name and history level (For Builder) */
    protected getBuffer(id: string, historyLevel: number = 0): GPUBuffer {
        try {
            return this.uniforms.getBuffer(id);
        } catch {
            const res = this.storages.get(id);
            if (!res) throw new Error(`Resource [${id}] not found.`);
            return res.getBuffer(historyLevel);
        }
    }

    /** Execute resource swap */
    protected swap(...ids: string[]) {
        for (const id of ids) {
            this.storages.get(id)?.swap();
        }
    }
}