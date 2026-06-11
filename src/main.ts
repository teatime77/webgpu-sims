import { CaptureTool } from './CaptureTool.js';
import { ComputePassBuilder, getMesh, initDevice, RenderPassBuilder, theDevice, theRunner, theSchema, writeUniformArray } from './SimulationRunner.js';
import { SimulationRunner, type ResourceBinding, SimulationSchema } from './SimulationRunner.js';
import { makeUIs } from './SimUI.js';
import { $btn, $canvas, $div, assert, fetchText, MeshDef, msg, MyError, parseURL, UniformDef } from './utils.js';
import { appManager, initEventHandler, initWebGpuSimsNavigationManager } from './start.js';
import { parseSchema } from './parser.js';
import { initSyntaxHighlightEditor } from './editor.js';

export let schemaText : string;
export let theArticles : Article[];

let captureTool : CaptureTool;

let afterFrame : (()=>void) | undefined;

export function setAfterFrame(fnc : ()=>void){
    afterFrame = fnc;
}

export async function bootstrap(sim: SimulationSchema) {
    const runner = new SimulationRunner();

    const mainCanvas = $canvas("main-canvas");
    runner.addCanvas(mainCanvas.id, mainCanvas);

    if(captureTool == undefined){
        captureTool = new CaptureTool();
    }

    if(sim.uis){
        makeUIs(runner, sim);
    }

    runner.makeCanvases(sim);

    const format = runner.getFormat();

    // ========================================================
    // ★ Build passes (Builder)
    // ========================================================
    for (const node of sim.shaders) {
        let shader : string;

        if (node.type === 'compute'){

            shader = node.nodeShaderCode!;
            assert(shader != undefined);
        }
        else if(node instanceof RenderPassBuilder){
            let fileName : string;
            const mesh = getMesh(node);
            if(mesh != undefined){

                switch(mesh.shape){
                case "sphere": 
                    fileName = "sphere_render.wgsl"; 
                    node.topology = 'triangle-list';
                    break;
                case "tube"  : 
                    fileName = "tube_render.wgsl"; 
                    node.topology = 'triangle-strip';
                    break;
                case "cylinder"  : 
                    fileName = "cylinder_render.wgsl"; 
                    node.topology = 'triangle-strip';
                    break;
                case "arrow" : 
                    fileName = "arrow_render.wgsl"; 
                    node.topology = 'triangle-list';
                    break;
                default: throw new MyError();
                }
            }
            else if(node.topology != undefined){
                switch(node.topology){
                case "point-list":
                    fileName = "point_render.wgsl"; 
                    break;
                case "line-list":
                    fileName = "line_render.wgsl"; 
                    break;
                case "triangle-list":
                    assert(node.shadingModel != undefined);
                    switch(node.shadingModel){
                    case "triangle-color":
                        fileName = "triangle/tri_triangle_color_render.wgsl";
                        break;
                    case "vertex-color":
                        fileName = "triangle/tri_vertex_color_render.wgsl";
                        break;
                    case "vertex-color-normal":
                        fileName = "triangle/tri_vertex_color_normal_render.wgsl";
                        break;
                    default:
                        throw new MyError();
                    }
                    break;
                default:
                    throw new MyError();
                }
            }
            else{
                throw new MyError();
            }

            const shaderUrl = `wgsl/${fileName}`;
            shader = await fetchText(shaderUrl);
        }
        else{
            throw new MyError();
        }
        
        if (node instanceof ComputePassBuilder) {
            node.initComputePass(theDevice, shader, 'main');
            const groups = new Set<number>(node.bindings.map((b: ResourceBinding) => b.group || 0));
            groups.forEach(g => {
                node.setGroup(g);
                node.bindings.filter((b: ResourceBinding) => (b.group || 0) === g).forEach((b: ResourceBinding) => {
                    const res = b.resourceDef!;
                    if(! (res instanceof MeshDef) && res.type === 'uniform'){
                        node.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    }
                    else{
                        node.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                    }
                });
            });
        } 
        else if(node instanceof RenderPassBuilder){

            // Get topology, blendMode, depthTest from schema
            const hasDepth = node.depthTest !== false;
            node.initRenderPass(theDevice, shader, format, { 
                blendMode: node.blendMode || 'normal',
                depthFormat: hasDepth ? 'depth24plus' : undefined 
            });
            node.hasDepth = hasDepth; // Flag for use inside the loop

            const groups = new Set<number>(node.bindings.map((b: ResourceBinding) => b.group || 0));
            groups.forEach(g => {
                node.setGroup(g);
                node.bindings.filter((b: ResourceBinding) => (b.group || 0) === g).forEach((b: ResourceBinding) => {
                    const res = b.resourceDef!;
                    if (res instanceof UniformDef){
                        node.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    } 
                    else{
                        node.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                    } 
                });
            });
        }
    }

    runner.initScript();

        function frame() {
        if(theSchema == undefined || theSchema.shaders.length == 0){
            return;
        }

        // 1. Initialize command encoder and run Compute Shaders first
        runner.currentCommandEncoder = theDevice.createCommandEncoder();

        while (true) {
            runner.setTime();
            const result = runner.generator!.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;
        }

        // Submit compute passes immediately
        theDevice.queue.submit([runner.currentCommandEncoder.finish()]);

        const renders = runner.getRenders();
        const clearedCanvases = new Set<string>();
        
        // 2. Process each canvas with isolated, individual command encoders
        for(const canvasDef of theSchema.canvases!){
            
            const aspect = canvasDef.canvas.width / canvasDef.canvas.height;
            const matrices = canvasDef.camera.getMatrices(aspect);
            const nums = matrices.viewProjection.concat(matrices.view);
            
            // Write the matrices for THIS specific canvas into the shared buffer
            writeUniformArray('Camera', nums);

            // Create a dedicated, clean command encoder for this canvas block
            const canvasEncoder = theDevice.createCommandEncoder();
            runner.currentCommandEncoder = canvasEncoder; // Re-route the runner to use this encoder

            const rendersforCanvas = renders.filter(x => x.getCanvasId() == canvasDef.id);
            for(const render of rendersforCanvas){
                if(render.vertexCount == undefined){
                    throw new MyError();
                }

                const shouldClear = !clearedCanvases.has(canvasDef.id);
                clearedCanvases.add(canvasDef.id);

                theRunner.render(render, true, shouldClear);
            }

            // 🌟 SUBMIT IMMEDIATELY: Locks in the draw calls with the current uniform state
            theDevice.queue.submit([canvasEncoder.finish()]);
        }

        if(afterFrame != undefined){
            afterFrame();
            afterFrame = undefined;
        }
        
        runner.currentCommandEncoder = null;
        requestAnimationFrame(frame);
    }

    frame();
}

export async function initWebGpuSims(){
    parseURL();

    await initDevice();
    fetchText("schema.md").then((value:string)=>{
        schemaText = value;
        // msg("schema loaded");
        $btn("wizard-btn").disabled = false;
    });

    initEventHandler();
    initSyntaxHighlightEditor($div("schema-editor"));
}

export interface AbstractArticle {
    authorId : string;
    title    : string;
    thumbnailUrl : string;
}

export interface Article extends AbstractArticle {
    schemaUrl : string;
}

async function getContents(articles : Article[]) {

    const div = $div("articles");
    for (const [idx, doc] of articles.entries()) {
        // msg(`doc: ${doc.authorId} ${doc.title} ${doc.thumbnailUrl}`);

        const box = document.createElement("div");
        box.className = "box";

        box.addEventListener("click", (_: PointerEvent) => {
            appManager.navigateTo(`/post/${idx}`);
        });

        const img = document.createElement("img");
        img.className = "box-thumbnail";
        img.src = doc.thumbnailUrl!;

        box.appendChild(img);

        const title = document.createElement("span");
        title.textContent = doc.title;

        box.appendChild(title);

        const user = document.createElement("span");
        user.textContent = doc.authorId;

        box.appendChild(user);

        div.appendChild(box);
    }
}


export async function initApp(){
    initWebGpuSimsNavigationManager();
    await initWebGpuSims();

    theArticles = [];

    const schemaPaths = await fetchText("docs/index.txt");
    for(const line of schemaPaths.split("\n")){
        if(line.trim() == ""){
            break;
        }

        const names = line.split("/");
        const authorId = names.at(-3)!;
        const title = names.at(-2)!;
        // msg(`name:[${authorId}][${title}]`)
        const schemaUrl = `docs/${line}`;

        const thumbnailUrl = `docs/${authorId}/${title}/thumbnail.png`;   
        msg(`thumbnail-Url:${thumbnailUrl}`);

        theArticles.push({ authorId, title, thumbnailUrl, schemaUrl });
    }

    appManager.showView("main-view");
    await getContents(theArticles);
}
