// src/core/engine/SimulationRunner.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';
import type { ResourceDef } from './SimulationBase';
import type { ComputePassBuilder } from '../builder/ComputePassBuilder';
import type { RenderPassBuilder } from '../builder/RenderPassBuilder';

export interface ResourceBinding {
    group?: number;
    binding?: number;
    resource: string;
    historyLevel?: number;
    varName?: string;
    access?: string;
}

export interface NodeDef {
    id: string;
    type: 'compute' | 'render';
    topology?: GPUPrimitiveTopology;
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal';
    depthTest?: boolean;
    bindings: ResourceBinding[];
}

export type PassCommand = 'frame' | undefined;

export function defineSimulation(schema: SimulationSchema): SimulationSchema {
    return schema;
}

export interface SimulationSchema {
    name?: string;
    resources: Record<string, ResourceDef>;
    nodes: NodeDef[];
    init?: (runner: SimulationRunner) => void | Promise<void>;
    script: (runner: SimulationRunner) => Generator<PassCommand, void, unknown> | Iterator<PassCommand, void, unknown>;
}

export class SimulationRunner {
    public device: GPUDevice;
    public uniforms: UniformManager;
    public storages: Map<string, ResourceWrapper> = new Map();
    private engine: WebGPUEngine;
    public passes: Map<string, ComputePassBuilder | RenderPassBuilder> = new Map();
    public currentCommandEncoder: GPUCommandEncoder | null = null;
    private initializedCanvases = new Set<string>(['main-canvas']);

    constructor(engine: WebGPUEngine) {
        this.engine = engine;
        this.device = engine.device;
        this.uniforms = new UniformManager(this.device);
    }

    /** V1.5のスキーマ(設計図)を読み込み、GPUリソースを自動生成する */
    async loadSchema(schema: SimulationSchema) {
        // 1. リソースの構築
        for (const [id, def] of Object.entries<ResourceDef>(schema.resources)) {
            if (def.type === 'uniform') {
                // UniformManager にパディング計算を任せる
                if (def.fields) this.uniforms.register(id, def.fields);
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

    compute(id: string, x: number, y = 1, z = 1) {
        if (!this.currentCommandEncoder) throw new Error("CommandEncoder is not active.");
        const builder = this.passes.get(id) as ComputePassBuilder;
        const cPass = this.currentCommandEncoder.beginComputePass();
        builder.dispatch(cPass, x, y, z);
        cPass.end();
    }

    render(id: string, vertexCount: number, instanceCount = 1, hasDepth?: boolean, canvasId = 'main-canvas') {
        if (!this.currentCommandEncoder) throw new Error("CommandEncoder is not active.");

        if (!this.initializedCanvases.has(canvasId)) {
            // DOMにキャンバスが存在しない場合は自動生成する
            if (!document.getElementById(canvasId)) {
                const container = document.getElementById('sub-canvases') || document.body;
                
                const wrapper = document.createElement('div');
                wrapper.className = 'sub-canvas-wrapper';
                
                const label = document.createElement('div');
                label.innerText = canvasId;
                label.className = 'sub-canvas-label';
                
                const newCanvas = document.createElement('canvas');
                newCanvas.id = canvasId;
                newCanvas.width = 256;
                newCanvas.height = 256;
                if (canvasId != 'main-canvas') {
                    newCanvas.className = 'debug-canvas';
                }
                
                wrapper.appendChild(label);
                wrapper.appendChild(newCanvas);
                container.appendChild(wrapper);
            }

            this.engine.addCanvas(canvasId);
            this.initializedCanvases.add(canvasId);
        }

        const builder = this.passes.get(id) as RenderPassBuilder;
        const useDepth = hasDepth !== undefined ? hasDepth : builder.hasDepth;
        
        const passDesc: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.engine.getContext(canvasId).getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.01, a: 1.0 },
                loadOp: 'clear', storeOp: 'store'
            }]
        };
        if (useDepth) {
            passDesc.depthStencilAttachment = {
                view: this.engine.getDepthView(canvasId),
                depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
            };
        }
        const rPass = this.currentCommandEncoder.beginRenderPass(passDesc);
        builder.draw(rPass, vertexCount, instanceCount);
        rPass.end();
    }
}