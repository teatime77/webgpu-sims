// src/core/SimulationRunner.ts
import { isRenderMesh, ResourceDef, MeshDef, UniformDef, StorageDef, getShapeStride } from './utils';
import { makeGeodesicPolyhedron, makeTube, msg } from './primitive';
import { theSchema } from '../main';
import { getElementSize, MyError } from './utils';
import { assert } from './CaptureTool';

export let theRunner : SimulationRunner;

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
    topology?: GPUPrimitiveTopology;
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal';
    depthTest?: boolean;
    bindings!: ResourceBinding[];
    vertexCount?: number;
    instanceCount?: number;
    canvasId?: string;

    constructor(data : any){
        data.bindings = data.bindings.map((x: any) => new ResourceBinding(x));
        Object.assign(this, data);
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
    dispatch(passEncoder: GPUComputePassEncoder, workgroupCountX: number, workgroupCountY: number = 1, workgroupCountZ: number = 1) {
        passEncoder.setPipeline(this.pipeline);

        // Create and set BindGroups for all registered groups
        for (const [groupIndex, entries] of this.bindGroupEntries.entries()) {
            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });
            passEncoder.setBindGroup(groupIndex, bindGroup);
        }

        // Dispatch workgroups
        passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    }
    
    /**
     * A method to clear and re-register entries
     * for cases where buffers switch every frame (like double buffering).
     */
    clearBindings() {
        this.bindGroupEntries.clear();
        this.currentGroupIndex = 0;
        this.currentBindingIndex = 0;
    }
}

export interface RenderPassOptions {
    topology?: GPUPrimitiveTopology; // e.g., 'triangle-list', 'line-list', 'point-list'
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
    node! : NodeDef;

    initRenderPass(
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

export interface RangeDef {
    type : "range",
    obj:any,
    name:string,
    label: string, 
    min: number, 
    max: number, 
    step: number, 
    initial?: number
}

export interface SelectDef {
    type : "select",
    obj:any,
    name:string,
    label: string, 
    options: {value: number, text: string}[], 
    initial?: number,
    reset? : boolean
}

export interface ButtonDef {
    type : "button",
    obj:any,
    name:string,
    label: string, 
}

export type UIDef = RangeDef | SelectDef | ButtonDef;

export type PassCommand = 'frame' | undefined;


export interface ISimulationSchema {
    name?: string;
    resources: Record<string, ResourceDef>;
    shaders: NodeDef[];
    uis? : UIDef[];
    script: () => Generator<PassCommand, void, unknown>;
}

export class SimulationSchema {
    name?: string;
    resources: Map<string, ResourceDef>;
    shaders: NodeDef[];
    nodeMap : Map<string, NodeDef>;
    uis? : UIDef[];
    script: () => Generator<PassCommand, void, unknown>;

    constructor(device: GPUDevice, data: ISimulationSchema){
        this.name = data.name;
        this.resources = new Map<string, ResourceDef>();
        for(const [id, val] of Object.entries(data.resources)){
            // let def: ResourceDef;
            if(val.type == "mesh"){
                const def = new MeshDef(id, val as any);

                switch(def.shape){
                case "sphere":
                    def.data = makeGeodesicPolyhedron(def.division);
                    break;
                case "tube":
                    def.data = makeTube(def.division);
                    break;
                default:
                    throw new Error();
                }

                const buffer = device.createBuffer({
                    label: `Storage_${id}`,
                    size: def.data.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
                });

                def.buffers = [buffer];
                def.bufferCount = 1;

                this.resources.set(id, def);
            }
            else if(val.type == "storage"){
                const def = new StorageDef(id, val as any);

                const count = def.bufferCount || 1;
                const buffers: GPUBuffer[] = [];
                
                // Calculate byte size of a single element from WGSL format
                if(def.format == undefined){
                    throw new MyError();
                }
                const elementSize = getElementSize(def.format);
                
                const byteSize = elementSize * (def.count || 1);

                for (let i = 0; i < count; i++) {
                    buffers.push(device.createBuffer({
                        label: `Storage_${id}_${i}`,
                        size: byteSize,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
                    }));
                }

                def.buffers = buffers;
                def.bufferCount = count;


                this.resources.set(id, def);
            }
            else if(val.type == "uniform"){
                const def = new UniformDef(id, val as any);

                def.initUniform(device);

                this.resources.set(id, def);
            }
            else{
                throw new MyError();
            }
        }

        if(! this.resources.has("Camera")){
            const Camera = { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } };
            const def = new UniformDef("Camera", Camera);
            def.initUniform(device);
            this.resources.set("Camera", def);
            msg("make camera");
        }

        this.shaders = data.shaders.map(x => {
            if(x.type == "compute"){
                return new ComputePassBuilder(x);
            }
            else if(x.type == "render"){
                return new RenderPassBuilder(x);
            }
            else{
                throw new MyError();
            }
        });

        const shapeReses = Array.from(this.resources.values()).filter(x => x instanceof StorageDef && x.meshRef != undefined) as StorageDef[];
        for(const res of shapeReses){
            const mesh = this.resources.get(res.meshRef!)! as MeshDef;
            assert(mesh instanceof MeshDef);

            const stride = getShapeStride(mesh.shape);

            const renderDef = {
                id: `${res.id}_render`,
                type: 'render',
                vertexCount: mesh.data.length / (3 + 3),    // position + norm
                instanceCount: res.count! / stride,
                bindings: [
                    { resource: 'Camera' },
                    { resource: res.id, varName: 'instances' },
                    { resource: mesh.id, varName: 'vertexData' }
                ]
            }

            const render = new RenderPassBuilder(renderDef);
            this.shaders.push(render);
        }

        this.shaders.forEach(node => node.bindings.forEach(b => {
            b.resourceDef = this.resources.get(b.resource);
            assert(b.resourceDef != undefined);            
        }));

        this.nodeMap = new Map<string, NodeDef>(this.shaders.map(x => [x.id, x]));

        this.uis   = data.uis;
        this.script = data.script;        
    }

    getNode(id:string) : NodeDef {
        const node = this.shaders.find(x => x.id == id)!;
        assert(node != undefined);

        return node;
    }

    getUniform(id:string) : UniformDef | undefined {
        const res = this.resources.get(id);
        if(res instanceof UniformDef){
            return res;
        }
        else{
            return undefined;
        }
    }
}

export class SimulationRunner {
    public device!: GPUDevice;
    public currentCommandEncoder: GPUCommandEncoder | null = null;
    private initializedCanvases = new Set<string>(['main-canvas']);
    public generator? : Generator<PassCommand, void, unknown>;
    schema!: SimulationSchema;
    startTime : number = 0;

    // public device!: GPUDevice;
    public format!: GPUTextureFormat;
    
    // Map to manage multiple canvas contexts
    private contexts: Map<string, GPUCanvasContext> = new Map();

    private depthViews: Map<string, GPUTextureView> = new Map();

    constructor(){
        theRunner = this;
    }

    /**
     * Initialize WebGPU. Call once when the application starts.
     */
    async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error("WebGPU is not supported on this browser.");
            alert("This browser does not support WebGPU. Please use a supported browser like Chrome.");
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("No appropriate GPUAdapter found.");
            return false;
        }

        // Request GPUDevice (this will be the parent of all resources)
        this.device = await adapter.requestDevice();
        // Get the optimal format for screen output (usually 'bgra8unorm' etc.)
        this.format = navigator.gpu.getPreferredCanvasFormat();

        console.log("WebGPU Engine Initialized Successfully.");
        return true;
    }

    /**
     * Register the canvas with the engine and set it up for drawing with WebGPU.
     * @param canvasId The ID of the canvas element in HTML
     */
    addCanvas(canvasId: string): GPUCanvasContext | null {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            console.error(`Canvas ID '${canvasId}' not found.`);
            return null;
        }

        const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        if (!context) {
            console.error("Failed to get WebGPU context.");
            return null;
        }

        context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.contexts.set(canvasId, context);

        // Create and save a depth texture of the same size as the canvas
        const depthTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthViews.set(canvasId, depthTexture.createView());

        return context;
    }

    /**
     * Get a registered context. Used when executing a render pass.
     */
    getContext(canvasId: string): GPUCanvasContext {
        const context = this.contexts.get(canvasId);
        if (!context) {
            throw new Error(`Canvas '${canvasId}' is not registered.`);
        }
        return context;
    }

    // Method to get the depth view
    getDepthView(canvasId: string): GPUTextureView {
        const view = this.depthViews.get(canvasId);
        if (!view) {
            throw new Error(`The depth view for canvas '${canvasId}' is not registered.`);
        }
        return view;
    }

    /**
     * Get all registered canvas elements and their IDs (for capture)
     */
    getCanvases(): { id: string, canvas: HTMLCanvasElement }[] {
        const result: { id: string, canvas: HTMLCanvasElement }[] = [];
        for (const [id, context] of this.contexts.entries()) {
            result.push({ id, canvas: context.canvas as HTMLCanvasElement });
        }
        return result;
    }

    // --- Interfaces called from main.ts or schemas ---

    getFormat(): GPUTextureFormat {
        return navigator.gpu.getPreferredCanvasFormat();
    }

    getUniformBuffer(id: string): GPUBuffer {
        const res = theSchema.resources.get(id) as UniformDef;
        assert(res instanceof UniformDef);

        return res.buffer;
    }

    getStorageBuffer(id: string, historyLevel: number = 0): GPUBuffer {
        const res = theSchema.resources.get(id);
        if (!res) throw new Error(`Storage resource [${id}] not found`);
        return res.getBuffer(historyLevel);
    }

    writeUniformArray(name:string, data: number[]){
        let arrayData = new Float32Array(data);
        this.device.queue.writeBuffer(this.getUniformBuffer(name), 0, arrayData);
    }

    writeUniformObject(name:string, data: any){
        const res = theSchema.resources.get(name) as UniformDef;
        assert(res instanceof UniformDef);

        res.update(data);
    }

    writeStorage(id: string, data: Float32Array | Uint32Array) {
        const buf = this.getStorageBuffer(id, 0);
        this.device.queue.writeBuffer(buf, 0, data);
    }

    swap(id: string) {
        theSchema.resources.get(id)?.swap();
    }

    compute(id: string) {
        if (!this.currentCommandEncoder) throw new Error("CommandEncoder is not active.");
        const builder = theSchema.nodeMap.get(id) as ComputePassBuilder;

        let x:number;
        let y:number;
        let z:number;

        if(builder.workgroupCount == undefined){
            throw new MyError();
        }

        if(typeof builder.workgroupCount == "number"){
            [x, y, z] = [builder.workgroupCount, 1, 1];
        }
        else if(builder.workgroupCount.length == 2){
            [x, y] = builder.workgroupCount; z = 1;
        }
        else if(builder.workgroupCount.length == 3){
            [x, y, z] = builder.workgroupCount;
        }
        else{
            throw new MyError();
        }
        const cPass = this.currentCommandEncoder.beginComputePass();
        builder.dispatch(cPass, x, y, z);
        cPass.end();
    }

    initCanvas(canvasId : string){
        if (this.initializedCanvases.has(canvasId)) {
            return;
        }

        // Automatically create a canvas if it does not exist in the DOM
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

        this.addCanvas(canvasId);
        this.initializedCanvases.add(canvasId);
    }

    // Added clearScreen parameter with a default of true
    render(id: string, vertexCount: number, instanceCount = 1, hasDepth?: boolean, clearScreen: boolean = true, canvasId = 'main-canvas') {
        if (!this.currentCommandEncoder) throw new Error("CommandEncoder is not active.");

        this.initCanvas(canvasId);

        const builder = this.schema.getNode(id) as RenderPassBuilder;
        const useDepth = hasDepth !== undefined ? hasDepth : builder.hasDepth;

        // Determine the load operation based on the flag
        const loadOperation = clearScreen ? 'clear' : 'load';

        const passDesc: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.getContext(canvasId).getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.01, a: 1.0 },
                loadOp: loadOperation, // Dynamically set
                storeOp: 'store'
            }]
        };
        if (useDepth) {
            passDesc.depthStencilAttachment = {
                view: this.getDepthView(canvasId),
                depthClearValue: 1.0,
                depthLoadOp: loadOperation, // Dynamically set
                depthStoreOp: 'store'
            };
        }
        const rPass = this.currentCommandEncoder.beginRenderPass(passDesc);
        builder.draw(rPass, vertexCount, instanceCount);
        rPass.end();
    }

    renderMesh(id: string, clearScreen: boolean){
        const builder = this.schema.getNode(id) as RenderPassBuilder;
        const node = builder.node;
        if(builder == undefined || node.vertexCount == undefined || node.instanceCount == undefined){
            throw new Error();
        }

        this.render(id, node.vertexCount, node.instanceCount, true, clearScreen, node.canvasId);
    }

    getMeshRenders() : RenderPassBuilder[] {
        return Array.from(this.schema.shaders).filter(x => x instanceof RenderPassBuilder && isRenderMesh(theSchema, x.node) ) as RenderPassBuilder[];
    }

    initScript(){
        this.generator = this.schema.script();
        this.startTime = NaN;

        for(const [key, def] of theSchema.resources.entries()){
            if(def instanceof MeshDef){
                msg(`mesh:${key}`);

                this.device.queue.writeBuffer(def.buffers[0], 0, def.data);
            }
        }        
    }

    setTime(){
        const uni = this.schema.getUniform("Params");
        if(uni != undefined && uni.obj != undefined && typeof uni.obj.time == "number" ){
            if(isNaN(this.startTime)){
                this.startTime = Date.now();
                uni.obj.time = 0;
            }
            else{
                uni.obj.time = (Date.now() - this.startTime) / 1000.0;
            }
        }
    }
}

let simRunner : SimulationRunner;

export function setRunner(runner : SimulationRunner){
    simRunner = runner;
}

export function compute(id: string){
    simRunner.compute(id);
}

export function render(id: string, vertexCount: number, instanceCount = 1, hasDepth?: boolean, clearScreen: boolean = true, canvasId = 'main-canvas'){
    simRunner.render(id, vertexCount, instanceCount, hasDepth, clearScreen, canvasId)
}

export function renderMesh(id: string, clearScreen: boolean = true){
    simRunner.renderMesh(id, clearScreen);
}

export function writeUniformObject(name:string, data: any){
    simRunner.writeUniformObject(name, data);
}

export function writeUniformArray(name:string, data: number[]){
    simRunner.writeUniformArray(name, data);
}

export function swap(id: string){
    simRunner.swap(id);
}

export function writeStorage(id: string, data: Float32Array | Uint32Array){
    simRunner.writeStorage(id, data);
}

export function getMesh(node : NodeDef) : MeshDef | undefined {
        assert(node.type == "render");
        const mesh = node.bindings.map(b => b.resourceDef!).find(res => res instanceof MeshDef)!;

        return mesh;
    }
