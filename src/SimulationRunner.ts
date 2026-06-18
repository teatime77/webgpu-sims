import { msg, $div, $canvas } from './utils.js';
import { assert } from './utils.js';
import { CallStatement, FunctionExpression } from './syntax.js';
import { OrbitCamera } from './camera.js';
import { SimulationSchema, theSchema } from './schema.js';
import { MeshDef, UniformDef } from './resource.js';
import { NodeDef, RenderPassBuilder } from './pipeline.js';
import { ResolveVariableReferences } from './parser.js';

export let theDevice: GPUDevice;
export let theFormat: GPUTextureFormat;

export let theRunner : SimulationRunner;

/**
 * Initialize WebGPU. Call once when the application starts.
 */
export async function initDevice(): Promise<boolean> {
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
    theDevice = await adapter.requestDevice();
    // Get the optimal format for screen output (usually 'bgra8unorm' etc.)
    theFormat = navigator.gpu.getPreferredCanvasFormat();

    console.log("WebGPU Engine Initialized Successfully.");
    return true;
}

export type PassCommand = 'frame' | undefined;

export interface CanvasDef {
    id : string;
    width : number;
    height : number;
    canvas :HTMLCanvasElement;
    context : GPUCanvasContext;
    camera : OrbitCamera;
}

export class SimulationRunner {
    public currentCommandEncoder: GPUCommandEncoder | null = null;
    public generator? : Generator<PassCommand, void, unknown>;
    startTime : number = 0;

    copyStorages : CallStatement[] = [];
    
    // Map to manage multiple canvas contexts
    private contexts: Map<string, GPUCanvasContext> = new Map();

    private depthViews: Map<string, GPUTextureView> = new Map();
    changedUniforms = new Set<UniformDef>();

    constructor(){
        theRunner = this;
    }

    clearCanvases(){
        for(const ctx of this.contexts.values()){
            // 1. カレントテクスチャの取得
            const textureView = ctx.getCurrentTexture().createView();
        
            // 2. コマンドエンコーダーの作成
            const commandEncoder = theDevice.createCommandEncoder();
        
            // 3. 描画パスの設定（ここで黒でクリアする指定を行う）
            const renderPassDescriptor : GPURenderPassDescriptor = {
            colorAttachments: [
                {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // 黒（RGBA: 0, 0, 0, 1）
                loadOp: 'clear',  // パス開始時に clearValue の色でクリアする
                storeOp: 'store', // 描画結果をテクスチャに保存する
                },
            ],
            };
        
            // 4. パスを開始してすぐに終了する（描画処理は何も書かない）
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.end();
        
            // 5. コマンドをキューに送信して実行
            theDevice.queue.submit([commandEncoder.finish()]);    
        }
    }

    /**
     * Register the canvas with the engine and set it up for drawing with WebGPU.
     * @param canvasId The ID of the canvas element in HTML
     */
    addCanvas(canvasId : string, canvas: HTMLCanvasElement): GPUCanvasContext | null {
        const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        if (!context) {
            console.error("Failed to get WebGPU context.");
            return null;
        }

        context.configure({
            device: theDevice,
            format: theFormat,
            alphaMode: 'premultiplied',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });

        this.contexts.set(canvasId, context);

        // Create and save a depth texture of the same size as the canvas
        const depthTexture = theDevice.createTexture({
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
        theDevice.queue.writeBuffer(this.getUniformBuffer(name), 0, arrayData);
    }

    makeCanvases(sim: SimulationSchema){
        const mainCanvas = $canvas("main-canvas");
        this.addCanvas(mainCanvas.id, mainCanvas);

        const mainCanvasDef = {
            id : mainCanvas.id,
            width : mainCanvas.width,
            height : mainCanvas.height
        } as CanvasDef;

        const container = $div('sub-canvases');
        container.innerHTML = "";

        if(sim.canvases == undefined){
            sim.canvases = [ mainCanvasDef ]
        }
        else{
            for(const canvasDef of sim.canvases){
                container.style.display = "block";
                
                const wrapper = document.createElement('div');
                wrapper.className = 'sub-canvas-wrapper';
                
                const label = document.createElement('div');
                label.innerText = canvasDef.id;
                label.className = 'sub-canvas-label';
                
                const newCanvas = document.createElement('canvas');
                newCanvas.id = canvasDef.id;
                newCanvas.width = canvasDef.width;
                newCanvas.height = canvasDef.height;
                newCanvas.className = 'debug-canvas';
                newCanvas.style.borderStyle = "ridge";
                newCanvas.style.borderWidth = "5px";
                
                wrapper.appendChild(label);
                wrapper.appendChild(newCanvas);
                container.appendChild(wrapper);

                this.addCanvas(canvasDef.id, newCanvas);
            }

            sim.canvases.unshift(mainCanvasDef);
        }


        for(const canvasDef of sim.canvases){
            canvasDef.canvas = $canvas(canvasDef.id);
            canvasDef.context = this.contexts.get(canvasDef.id)!;
            assert(canvasDef.canvas != undefined && canvasDef.context != undefined);
            canvasDef.camera = new OrbitCamera(canvasDef.canvas);
        }
    }

    // Added clearScreen parameter with a default of true
    render(canvasEncoder: GPUCommandEncoder, render : RenderPassBuilder, hasDepth?: boolean, clearScreen: boolean = true) {
        const instanceCount = render.instanceCount ?? 1;
        const canvasId = render.canvasId ?? 'main-canvas';

        const builder = theSchema.getNode(render.id) as RenderPassBuilder;
        const useDepth = hasDepth !== undefined ? hasDepth : builder.hasDepth;

        // 🌟 FIX: If instanceCount is explicitly passed as undefined or null, force it to fallback to builder's property or 1
        const finalInstanceCount = instanceCount ?? builder.instanceCount ?? 1;

        const loadOperation = clearScreen ? 'clear' : 'load';

        const passDesc: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.getContext(canvasId).getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.01, a: 1.0 },
                loadOp: loadOperation,
                storeOp: 'store'
            }]
        };
        if (useDepth) {
            passDesc.depthStencilAttachment = {
                view: this.getDepthView(canvasId),
                depthClearValue: 1.0,
                depthLoadOp: loadOperation,
                depthStoreOp: 'store'
            };
        }
        const rPass = canvasEncoder.beginRenderPass(passDesc);
        
        // 🌟 Use the sanitized finalInstanceCount here
        builder.draw(rPass, render.vertexCount!, finalInstanceCount);
        
        rPass.end();
    }

    getRenders() : RenderPassBuilder[] {
        return Array.from(theSchema.shaders).filter(x => x instanceof RenderPassBuilder) as RenderPassBuilder[];
    }

    initScript(){
        this.generator = runSchema(theSchema, this);
        this.startTime = NaN;

        for(const [key, def] of theSchema.resources.entries()){
            if(def instanceof MeshDef){
                // msg(`mesh:${key}`);

                theDevice.queue.writeBuffer(def.buffers[0], 0, def.data);
            }
        }        
    }

    setTime(){
        const uni = theSchema.getUniform("Params");
        if(uni != undefined && uni.obj != undefined){
            if(typeof uni.obj.value.time == "number"){
                if(isNaN(this.startTime)){
                    this.startTime = Date.now();
                    uni.obj.value.time = 0;
                }
                else{
                    uni.obj.value.time = (Date.now() - this.startTime) / 1000.0;
                }
            }
        }
    }
}

export function writeUniformArray(name:string, data: number[]){
    theRunner.writeUniformArray(name, data);
}

export function getMesh(node : NodeDef) : MeshDef | undefined {
    assert(node.type == "render");
    const mesh = node.bindings.map(b => b.resourceDef!).find(res => res instanceof MeshDef)!;

    return mesh;
}

export function* runSchema(schema:SimulationSchema, runner : SimulationRunner) : Generator<PassCommand, void, unknown> {
    const uniforms = schema.getUniforms();
    const shaders = theSchema.getComputeShaders();

    while(true){
        for(const uni of uniforms){
            uni.writeUniformBuffer();
        }

        if(schema.script != undefined){
            schema.script.execFunction();
        }
        else{

            for(const shader of shaders){
                shader.dispatch(runner);
            }
        }

        yield 'frame';
    }
}
