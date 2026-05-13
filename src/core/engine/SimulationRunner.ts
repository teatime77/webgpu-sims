// src/core/engine/SimulationRunner.ts
import { WebGPUEngine } from './WebGPUEngine';
import { UniformManager } from './UniformManager';
import { ResourceWrapper } from './ResourceWrapper';
import { isMesh, isRenderMesh, type MeshDef, type ResourceDef, type SphereDef } from './SimulationBase';
import type { ComputePassBuilder } from '../builder/ComputePassBuilder';
import { RenderPassBuilder } from '../builder/RenderPassBuilder';
import { makeGeodesicPolyhedron, makeTube, msg } from '../primitive';
import { theSchema } from '../../main';

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
    workgroupSize?: number | string | (number | string)[];
    topology?: GPUPrimitiveTopology;
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal';
    depthTest?: boolean;
    bindings: ResourceBinding[];
    vertexCount?: number;
    instanceCount?: number;
    canvasId?: string;
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

export interface SimulationSchema {
    name?: string;
    resources: Record<string, ResourceDef | MeshDef>;
    nodes: NodeDef[];
    uis? : UIDef[];
    script: () => Generator<PassCommand, void, unknown>;
}

export class SimulationRunner {
    public device: GPUDevice;
    public uniforms: UniformManager;
    public storages: Map<string, ResourceWrapper> = new Map();
    private engine: WebGPUEngine;
    public passes: Map<string, ComputePassBuilder | RenderPassBuilder> = new Map();
    public currentCommandEncoder: GPUCommandEncoder | null = null;
    private initializedCanvases = new Set<string>(['main-canvas']);
    public generator? : Generator<PassCommand, void, unknown>;
    schema!: SimulationSchema;

    constructor(engine: WebGPUEngine) {
        this.engine = engine;
        this.device = engine.device;
        this.uniforms = new UniformManager(this.device);
    }

    /** Load the V1.5 schema (blueprint) and automatically generate GPU resources */
    async loadSchema(schema: SimulationSchema) {
        this.schema = schema;

        // 1. Build resources
        for (const [id, def] of Object.entries<ResourceDef | MeshDef>(schema.resources)) {
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

                if (def.type === 'uniform') {
                    // Delegate padding calculation to UniformManager
                    if (def.fields) this.uniforms.register(id, def.fields);
                } 
                else if (def.type === 'storage') {
                    const count = def.bufferCount || 1;
                    const buffers: GPUBuffer[] = [];
                    
                    // Calculate byte size of a single element from WGSL format
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

        this.engine.addCanvas(canvasId);
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
                view: this.engine.getContext(canvasId).getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.01, a: 1.0 },
                loadOp: loadOperation, // Dynamically set
                storeOp: 'store'
            }]
        };
        if (useDepth) {
            passDesc.depthStencilAttachment = {
                view: this.engine.getDepthView(canvasId),
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
