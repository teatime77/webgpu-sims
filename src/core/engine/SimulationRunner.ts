// src/core/engine/SimulationRunner.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';

export class SimulationRunner {
    public device: GPUDevice;
    public uniforms: UniformManager;
    public storages: Map<string, ResourceWrapper> = new Map();
    private engine: WebGPUEngine;

    constructor(engine: WebGPUEngine) {
        this.engine = engine;
        this.device = engine.device;
        this.uniforms = new UniformManager(this.device);
    }

    /** V1.5のスキーマ(設計図)を読み込み、GPUリソースを自動生成する */
    async loadSchema(schema: any) {
        // 1. リソースの構築
        for (const [id, def] of Object.entries<any>(schema.resources)) {
            if (def.type === 'uniform') {
                // UniformManager にパディング計算を任せる
                this.uniforms.register(id, def.fields);
            } 
            else if (def.type === 'storage') {
                const count = def.bufferCount || 1;
                const buffers: GPUBuffer[] = [];
                
                // WGSLフォーマットから1要素のバイトサイズを計算
                let elementSize = 4; // f32, u32, i32
                if (def.format === 'vec2<f32>') elementSize = 8;
                else if (def.format === 'vec3<f32>' || def.format === 'vec4<f32>') elementSize = 16;
                else if (def.format === 'mat4x4<f32>') elementSize = 64;
                
                const byteSize = elementSize * (def.count || 1);

                for (let i = 0; i < count; i++) {
                    buffers.push(this.device.createBuffer({
                        label: `Storage_${id}_${i}`,
                        size: byteSize,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
                    }));
                }
                this.storages.set(id, new ResourceWrapper(id, buffers, count));
            }
        }

        // 2. スキーマ内の初期化ロジック (ParticleSim.ts の init) を実行
        if (schema.init) {
            await schema.init(this);
        }
    }

    // --- main.ts やスキーマから呼ばれるインターフェース群 ---

    getFormat(): GPUTextureFormat {
        return navigator.gpu.getPreferredCanvasFormat();
    }

    getUniformBuffer(id: string): GPUBuffer {
        return this.uniforms.getBuffer(id);
    }

    getStorageBuffer(id: string, historyLevel: number = 0): GPUBuffer {
        const res = this.storages.get(id);
        if (!res) throw new Error(`Storage resource [${id}] not found`);
        return res.getBuffer(historyLevel);
    }

    updateVariables(id: string, values: Record<string, any>) {
        this.uniforms.update(id, values);
    }

    writeStorage(id: string, data: Float32Array | Uint32Array) {
        const buf = this.getStorageBuffer(id, 0);
        this.device.queue.writeBuffer(buf, 0, data);
    }

    swap(id: string) {
        this.storages.get(id)?.swap();
    }
}