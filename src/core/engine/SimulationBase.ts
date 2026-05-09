// src/core/engine/SimulationBase.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager, type WgslFormat } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';

export interface ResourceDef {
    type: 'uniform' | 'storage';
    fields?: Record<string, WgslFormat>; // uniform用
    format?: WgslFormat;                 // storage用 (vec4<f32> など)
    elementByteSize?: number;            // storage用 (カスタム構造体: 今回の 32 bytes 等)
    count?: number;                      // storage用
    bufferCount?: number;                // Ping-Pong用
}

export abstract class SimulationBase {
    protected engine!: WebGPUEngine;
    protected uniforms!: UniformManager;
    protected storages = new Map<string, ResourceWrapper>();

    // 子クラスで宣言するリソース設計図
    abstract defineResources(): Record<string, ResourceDef>;

    // エンジン初期化時に呼ばれる
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

                // フォーマットから1要素のバイトサイズを計算
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

    /** 名前と履歴レベルから GPUBuffer を取得する (Builder用) */
    protected getBuffer(id: string, historyLevel: number = 0): GPUBuffer {
        try {
            return this.uniforms.getBuffer(id);
        } catch {
            const res = this.storages.get(id);
            if (!res) throw new Error(`Resource [${id}] not found.`);
            return res.getBuffer(historyLevel);
        }
    }

    /** リソースのスワップを実行 */
    protected swap(...ids: string[]) {
        for (const id of ids) {
            this.storages.get(id)?.swap();
        }
    }
}