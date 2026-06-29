import { CaptureTool } from './CaptureTool.js';
import { getMesh, initDevice, theDevice, theRunner, writeUniformArray } from './SimulationRunner.js';
import { SimulationRunner } from './SimulationRunner.js';
import { makeUIs } from './SimUI.js';
import { $, $btn, $canvas, $div, assert, fetchJson, fetchText, msg, MyError, parseURL, urlHash, urlHome, urlOrigin, urlPathName } from './utils.js';
import { initEventHandler } from './start.js';
import { initSyntaxHighlightEditor } from './editor.js';
import { AppManager, appManager, initWebGpuSimsNavigationManager } from './AppManager.js';
import { SimulationSchema, theSchema } from './schema.js';
import { ComputePassBuilder, RenderPassBuilder, ResourceBinding } from './pipeline.js';
import { MeshDef, UniformDef } from './resource.js';

export let schemaText : string;
export let theArticles : Article[] = [];

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

    for(const [id, res] of sim.resources.entries()){
        res.makebufferss(theDevice, id);
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
                    case "scalar-grid":
                        fileName = "triangle/scalar_grid_render.wgsl"; 
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
        if(runner != theRunner){
            msg("runner changed");
            return;
        }

        if(theSchema == undefined || ! theSchema.isReady){
            requestAnimationFrame(frame);
            return;
        }

        // 1. Check if any copies from the previous frame are still pending
        const isWaitingForGPU = runner.copyStorages.some(cp => cp.busy);

        // 2. Only advance the generator if the CPU has the fresh data
        if (!isWaitingForGPU) {
            runner.copyStorages = []; // Clear the queue
            runner.currentCommandEncoder = theDevice.createCommandEncoder();
            runner.changedUniforms.clear();

            while (true) {
                runner.setTime();
                const result = runner.generator!.next();
                if (result.done){
                    break;
                } 
                
                const val = result.value;
                if (val === 'frame'){
                    break; // or if yielded for readback
                } 
            }

            // Submit compute passes immediately
            theDevice.queue.submit([runner.currentCommandEncoder.finish()]);
            runner.currentCommandEncoder = null;

            // Initiate any new copies that were requested during this generator step
            for(const cp of runner.copyStorages){
                cp.copyBuffers(theDevice).catch(console.error);
            }
        }

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

            const rendersforCanvas = renders.filter(x => x.getCanvasId() == canvasDef.id);
            for(const render of rendersforCanvas){
                if(render.vertexCount == undefined){
                    throw new MyError();
                }

                const shouldClear = !clearedCanvases.has(canvasDef.id);
                clearedCanvases.add(canvasDef.id);

                theRunner.render(canvasEncoder, render, true, shouldClear);
            }

            // 🌟 SUBMIT IMMEDIATELY: Locks in the draw calls with the current uniform state
            theDevice.queue.submit([canvasEncoder.finish()]);
        }

        if(afterFrame != undefined){
            afterFrame();
            afterFrame = undefined;
        }
        
        requestAnimationFrame(frame);
    }

    frame();

    sim.isReady = true;
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
    id: string;
    authorId : string;
    title    : string;
    thumbnailUrl : string;
    ai: string | undefined,
}

export interface Article extends AbstractArticle {
    schemaUrl : string;
}

export function makeArticleBox(div: HTMLDivElement, idx : number, doc : AbstractArticle, manager : AppManager){{
    // msg(`doc: ${doc.authorId} ${doc.title} ${doc.thumbnailUrl}`);

    const box = document.createElement("article");
    box.className = "box";

    box.addEventListener("click", (_: PointerEvent) => {
        manager.navigateTo(`/post/${doc.id}`);
    });

    const imgDiv = document.createElement("div");
    imgDiv.className = "box-thumbnail";

    const img = document.createElement("img");
    img.src = doc.thumbnailUrl!;

    imgDiv.append(img);
    box.appendChild(imgDiv);

    const boxContent = document.createElement("div");
    boxContent.className = "box-content";

    const title = document.createElement("h2");
    title.className = "box-title";
    title.textContent = doc.title;

    boxContent.appendChild(title);

    const user = document.createElement("div");
    user.className = "box-user-id";
    user.textContent = doc.authorId;
    boxContent.appendChild(user);

    if(doc.ai != undefined){
        const ai = document.createElement("div");
        ai.className = "box-ai";
        ai.textContent = doc.ai;
        boxContent.append(ai);
    }

    box.append(boxContent);

    div.appendChild(box);
}

}

export async function getArticles(){
    theArticles = [];

    const schemaPaths = await fetchText(`${urlHome}docs/index.txt`);
    for(const line of schemaPaths.split("\n")){
        if(line.trim() == ""){
            break;
        }

        const url = urlHome + "docs/" + line.replace("/schema.js", "/");

        let id: string;
        let authorId : string;
        let title : string;
        let ai : string | undefined;

        const article = await fetchJson(url + "article.json");

        if(article != undefined){

            id       = article.id;
            authorId = article.author;
            title    = article.title;
            ai       = article.ai;
        }
        else{
            
            const names = line.split("/");
            authorId = names.at(-3)!;
            title = names.at(-2)!.replaceAll("_", " ").replaceAll("-", " ");
            id = title;
        }
        // msg(`name:[${authorId}][${title}]`)
        const schemaUrl = `docs/${line}`;

        const thumbnailUrl = url + "thumbnail.png";   
        msg(`thumbnail-Url:${thumbnailUrl}`);

        theArticles.push({ id, authorId, title, thumbnailUrl, schemaUrl, ai });
    }
}

export async function getContents() {
    if(theArticles.length == 0){
        await getArticles();
    }

    const div = $div("articles");
    for (const [idx, doc] of theArticles.entries()) {
        makeArticleBox(div, idx, doc, appManager);
    }
}


export async function initApp(){   
    await initWebGpuSims();
    initWebGpuSimsNavigationManager();

    const allBtn = document.createElement("button");
    allBtn.textContent = "All";
    $("main-header-center").append(allBtn);
    allBtn.addEventListener("click", async() => {
        await appManager.showAll();
    });

    // appManager.showView("main-view");
}
