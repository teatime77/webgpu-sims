import { ResourceDef } from "./resource.js";
import { theSchema } from "./schema.js";
import { assert, MyError } from "./utils.js";

export type ShadingModel = 'triangle-color' | 'vertex-color' | 'vertex-color-normal';

export class ResourceBinding {
    group?: number;
    binding?: number;
    resource!: string;
    historyLevel?: number;
    varName?: string;
    access?: string;
    resourceDef? : ResourceDef;

    constructor(data : any){
        Object.assign(this, data)
    }
}

export abstract class NodeDef {
    id!: string;
    type!: 'compute' | 'render';
    workgroupSize?: number | string | (number | string)[];
    workgroupCount? : number | [number, number] | [number, number, number];
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal';
    depthTest?: boolean;
    bindings!: ResourceBinding[];
    vertexCount?: number;
    instanceCount?: number;
    nodeShaderCode? : string;

    constructor(data : any){
        data.bindings = data.bindings.map((x: any) => new ResourceBinding(x));
    }

    getNodeResources() : ResourceDef[] {
        return this.bindings.map(b => theSchema.resources.get(b.resource)!);
    }
}

export class ComputePassBuilder extends NodeDef{
    private device!: GPUDevice;
    private pipeline!: GPUComputePipeline;
    
    // Map that holds binding resources for each group
    // Example: Map { 0 => [entry1, entry2], 1 => [entry3] }
    private bindGroupEntries: Map<number, GPUBindGroupEntry[]> = new Map();
    
    private currentGroupIndex: number = 0;
    private currentBindingIndex: number = 0;

    constructor(data : any){
        super(data);
        Object.assign(this, data);
    }

    initComputePass(device: GPUDevice, shaderCode: string, entryPoint: string = 'main') {
        this.device = device;
        
        // 1. Create shader module
        const module = device.createShaderModule({ 
            label: `Compute Module (${entryPoint})`,
            code: shaderCode 
        });

        // 2. Create pipeline (auto-inferred from WGSL by layout: 'auto')
        this.pipeline = device.createComputePipeline({
            label: `Compute Pipeline (${entryPoint})`,
            layout: 'auto',
            compute: { module, entryPoint }
        });
    }

    /**
     * Switches the bind group index (@group(X)).
     * Calling this method resets the binding number to 0.
     */
    setGroup(groupIndex: number): this {
        this.currentGroupIndex = groupIndex;
        this.currentBindingIndex = 0; // Reset binding number when group changes
        
        if (!this.bindGroupEntries.has(groupIndex)) {
            this.bindGroupEntries.set(groupIndex, []);
        }
        return this; // For method chaining
    }

    /**
     * Adds a Uniform buffer. (@binding number is automatically incremented)
     */
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
     * Dispatches (executes) the compute pass.
     * Dynamically generates and sets BindGroups at runtime.
     */
    dispatch(encoder : GPUCommandEncoder) {
        assert(encoder != undefined);

        const passEncoder = encoder.beginComputePass();
        passEncoder.setPipeline(this.pipeline);

        // Create and set BindGroups for all registered groups
        for (const [groupIndex, entries] of this.bindGroupEntries.entries()) {
            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });
            passEncoder.setBindGroup(groupIndex, bindGroup);
        }

        let x:number;
        let y:number;
        let z:number;

        if(this.workgroupCount == undefined){
            throw new MyError();
        }

        if(typeof this.workgroupCount == "number"){
            [x, y, z] = [this.workgroupCount, 1, 1];
        }
        else if(this.workgroupCount.length == 2){
            [x, y] = this.workgroupCount; z = 1;
        }
        else if(this.workgroupCount.length == 3){
            [x, y, z] = this.workgroupCount;
        }
        else{
            throw new MyError();
        }

        // Dispatch workgroups
        passEncoder.dispatchWorkgroups(x, y, z);

        passEncoder.end();
    }
}

export interface RenderPassOptions {
    depthFormat?: GPUTextureFormat;  // Specify 'depth24plus' etc. if using depth testing
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal'; // Simple blend mode specification
    // * Since V2's basic strategy is Vertex Pulling, vertexLayouts are omitted (can be added if necessary)
}

export class RenderPassBuilder extends NodeDef {
    private device!: GPUDevice;
    private pipeline!: GPURenderPipeline;
    private bindGroupEntries: Map<number, GPUBindGroupEntry[]> = new Map();
    private currentGroupIndex: number = 0;
    private currentBindingIndex: number = 0;
    hasDepth : boolean = true;
    topology?: GPUPrimitiveTopology;
    shadingModel? : ShadingModel;
    canvasId?: string;

    constructor(data : any){
        super(data);
        Object.assign(this, data);
    }

    getCanvasId() : string {
        return this.canvasId ?? "main-canvas";
    }

    initRenderPass(
        device: GPUDevice, 
        shaderCode: string, 
        presentationFormat: GPUTextureFormat,
        options: RenderPassOptions = {}
    ) {
        this.device = device;

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
                topology: this.topology,
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
}
