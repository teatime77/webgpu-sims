// src/core/engine/SimulationRunner.ts
import { UniformManager } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';
import { isMesh, isRenderMesh, ResourceDef, MeshDef, UniformDef, StorageDef } from './utils';
import type { ComputePassBuilder } from '../builder/ComputePassBuilder';
import { RenderPassBuilder } from '../builder/RenderPassBuilder';
import { makeGeodesicPolyhedron, makeTube, msg } from '../primitive';
import { theSchema } from '../../main';
import { getElementSize, MyError } from './utils';

export class ResourceBinding {
    group?: number;
    binding?: number;
    resource!: string;
    historyLevel?: number;
    varName?: string;
    access?: string;

    constructor(data : any){
        Object.assign(this, data)
    }
}

export class NodeDef {
    id!: string;
    type!: 'compute' | 'render';
    workgroupSize?: number | string | (number | string)[];
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
    resources: Record<string, ResourceDef | MeshDef>;
    nodes: NodeDef[];
    uis? : UIDef[];
    script: () => Generator<PassCommand, void, unknown>;
}

export class SimulationSchema {
    name?: string;
    resources: Map<string, ResourceDef | MeshDef>;
    nodes: NodeDef[];
    uis? : UIDef[];
    script: () => Generator<PassCommand, void, unknown>;

    constructor(data: ISimulationSchema){
        this.name = data.name;
        this.resources = new Map();
        for(const [key, val] of Object.entries(data.resources)){
            if((val as any).shape != undefined){

                this.resources.set(key, new MeshDef(val as any));
            }
            else{
                if((val as any).type == 'uniform'){
                    this.resources.set(key, new UniformDef(val as any));
                }
                else{
                    this.resources.set(key, new StorageDef(val as any));
                }
            }
        }
        this.nodes = data.nodes.map(x => new NodeDef(x));
        this.uis   = data.uis;
        this.script = data.script;
        
    }
}

export class SimulationRunner {
    public device!: GPUDevice;
    public uniforms!: UniformManager;
    public storages: Map<string, ResourceWrapper> = new Map();
    public passes: Map<string, ComputePassBuilder | RenderPassBuilder> = new Map();
    public currentCommandEncoder: GPUCommandEncoder | null = null;
    private initializedCanvases = new Set<string>(['main-canvas']);
    public generator? : Generator<PassCommand, void, unknown>;
    schema!: SimulationSchema;

    // public device!: GPUDevice;
    public format!: GPUTextureFormat;
    
    // Map to manage multiple canvas contexts
    private contexts: Map<string, GPUCanvasContext> = new Map();

    private depthViews: Map<string, GPUTextureView> = new Map();


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

        this.uniforms = new UniformManager(this.device);

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



    constructor() {
    }

    /** Load the V1.5 schema (blueprint) and automatically generate GPU resources */
    async loadSchema(schema: SimulationSchema) {
        this.schema = schema;

        // 1. Build resources
        for (const [id, def] of schema.resources.entries()) {
            if(isMesh(def)){

                const elementSize = 4; // f32
                const byteSize = elementSize * def.count;

                const buffer = this.device.createBuffer({
                    label: `Storage_${id}`,
                    size: byteSize,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
                });

                this.storages.set(id, new ResourceWrapper(id, [buffer], 1, def));
            }
            else{

                if (def instanceof UniformDef) {
                    // Delegate padding calculation to UniformManager
                    if (def.fields) this.uniforms.register(id, def.fields);
                } 
                else if (def instanceof StorageDef) {
                    const count = def.bufferCount || 1;
                    const buffers: GPUBuffer[] = [];
                    
                    // Calculate byte size of a single element from WGSL format
                    if(def.format == undefined){
                        throw new MyError();
                    }
                    const elementSize = getElementSize(def.format);
                    
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
        }
    }

    // --- Interfaces called from main.ts or schemas ---

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

    writeUniformArray(name:string, data: number[]){
        let arrayData = new Float32Array(data);
        this.device.queue.writeBuffer(this.getUniformBuffer(name), 0, arrayData);
    }

    writeUniformObject(name:string, data: any){
        const values = Object.values(data);
        values.every(x => typeof x == "number");
        this.writeUniformArray(name, values as number[]);
    }

    writeStorage(id: string, data: Float32Array | Uint32Array) {
        const buf = this.getStorageBuffer(id, 0);
        this.device.queue.writeBuffer(buf, 0, data);
    }

    writeMesh(id: string) {
        const res = this.storages.get(id);
        if(res == undefined || res.mesh == undefined){
            throw new Error();
        }

        let data: Float32Array;
        switch(res.mesh.shape){
        case "sphere":
            data = makeGeodesicPolyhedron(res.mesh.division);
            break;
        case "tube":
            data = makeTube(res.mesh.division);
            break;
        default:
            throw new Error();
        }

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

        const builder = this.passes.get(id) as RenderPassBuilder;
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
        const builder = this.passes.get(id) as RenderPassBuilder;
        const node = builder.node;
        if(builder == undefined || node.vertexCount == undefined || node.instanceCount == undefined){
            throw new Error();
        }

        this.render(id, node.vertexCount, node.instanceCount, true, clearScreen, node.canvasId);
    }

    getMeshRenders() : RenderPassBuilder[] {
        return Array.from(this.passes.values()).filter(x => x instanceof RenderPassBuilder && isRenderMesh(theSchema, x.node) ) as RenderPassBuilder[];
    }

    initScript(){
        this.generator = this.schema.script();

        Object.entries(theSchema.resources).forEach(([key, value]) => {
            if(isMesh(value)){
                msg(`mesh:${key}`);
                writeMesh(key);
            }
        });
        
    }
}

let simRunner : SimulationRunner;

export function setRunner(runner : SimulationRunner){
    simRunner = runner;
}

export function compute(id: string, x: number, y = 1, z = 1){
    simRunner.compute(id, x, y, z);
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

export function writeMesh(id: string){
    simRunner.writeMesh(id);
}
