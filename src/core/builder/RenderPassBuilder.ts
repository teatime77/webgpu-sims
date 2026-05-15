// src/core/builder/RenderPassBuilder.ts

import { theSchema } from "../../main";
import type { NodeDef } from "../engine/SimulationRunner";
import { MeshDef } from "../engine/utils";

export interface RenderPassOptions {
    topology?: GPUPrimitiveTopology; // e.g., 'triangle-list', 'line-list', 'point-list'
    depthFormat?: GPUTextureFormat;  // Specify 'depth24plus' etc. if using depth testing
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal'; // Simple blend mode specification
    // * Since V2's basic strategy is Vertex Pulling, vertexLayouts are omitted (can be added if necessary)
}

export class RenderPassBuilder {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroupEntries: Map<number, GPUBindGroupEntry[]> = new Map();
    private currentGroupIndex: number = 0;
    private currentBindingIndex: number = 0;
    hasDepth : boolean = true;
    node : NodeDef;

    constructor(
        device: GPUDevice, 
        node : NodeDef,
        shaderCode: string, 
        presentationFormat: GPUTextureFormat,
        options: RenderPassOptions = {}
    ) {
        this.device = device;
        this.node   = node;

        let topology: GPUPrimitiveTopology;
        const mesh = node.bindings.map(b => theSchema.resources.get(b.resource)!).find(res => res instanceof MeshDef);
        if(mesh != undefined && mesh.shape == "tube"){
            topology = 'triangle-strip';
        }
        else{

            topology = options.topology || 'triangle-list';
        }

        // 1. Create shader module (assuming VS and FS are written in a single file)
        const module = device.createShaderModule({
            label: 'Render Module',
            code: shaderCode
        });

        // 2. Determine blend state
        let blendState: GPUBlendState | undefined = undefined;
        if (options.blendMode === 'alpha') {
            blendState = {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            };
        } else if (options.blendMode === 'add') {
            blendState = {
                color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
            };
        }

        // 3. Determine depth stencil state
        let depthStencil: GPUDepthStencilState | undefined = undefined;
        if (options.depthFormat) {
            depthStencil = {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: options.depthFormat,
            };
        }

        // 4. Create pipeline (auto layout resolves bindings automatically)
        this.pipeline = device.createRenderPipeline({
            label: `Render Pipeline`,
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [] // ★ Empty array because it is specifically designed for Vertex Pulling
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{
                    format: presentationFormat,
                    blend: blendState
                }]
            },
            primitive: { 
                topology: topology,
                cullMode: 'none' // Can be changed to 'back' etc. as needed
            },
            depthStencil: depthStencil
        });
    }

    // --- Exact same interface as ComputePassBuilder ---
    setGroup(groupIndex: number): this {
        this.currentGroupIndex = groupIndex;
        this.currentBindingIndex = 0;
        if (!this.bindGroupEntries.has(groupIndex)) {
            this.bindGroupEntries.set(groupIndex, []);
        }
        return this;
    }

    // Added second argument explicitBinding
    addUniform(buffer: GPUBuffer, explicitBinding?: number): this {
        const binding = explicitBinding ?? this.currentBindingIndex;
        this.bindGroupEntries.get(this.currentGroupIndex)!.push({
            binding: binding,
            resource: { buffer }
        });
        this.currentBindingIndex = binding + 1; // Prepare for the next automatic numbering
        return this;
    }

    // Added second argument explicitBinding
    addStorage(buffer: GPUBuffer, explicitBinding?: number): this {
        const binding = explicitBinding ?? this.currentBindingIndex;
        this.bindGroupEntries.get(this.currentGroupIndex)!.push({
            binding: binding,
            resource: { buffer }
        });
        this.currentBindingIndex = binding + 1; // Prepare for the next automatic numbering
        return this;
    }

    /**
     * Executes the render pass.
     */
    draw(passEncoder: GPURenderPassEncoder, vertexCount: number, instanceCount: number = 1) {
        passEncoder.setPipeline(this.pipeline);

        for (const [groupIndex, entries] of this.bindGroupEntries.entries()) {
            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });
            passEncoder.setBindGroup(groupIndex, bindGroup);
        }

        passEncoder.draw(vertexCount, instanceCount, 0, 0);
    }

    clearBindings() {
        this.bindGroupEntries.clear();
        this.currentGroupIndex = 0;
        this.currentBindingIndex = 0;
    }
}