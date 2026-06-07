// src/main.ts
import { OrbitCamera } from './camera.js';
import { CaptureTool } from './CaptureTool.js';
import { ComputePassBuilder, getMesh, initDevice, RenderPassBuilder, theDevice, theRunner, theSchema, writeUniformArray } from './SimulationRunner.js';
import { SimulationRunner, type ResourceBinding, SimulationSchema } from './SimulationRunner.js';
import { makeUIs } from './SimUI.js';
import { $btn, $div, assert, copyToClipboard, fetchText, MeshDef, msg, MyError, parseURL, showToast, UniformDef } from './utils.js';
import { initEventHandler, initWebGpuSimsNavigationManager, appManager, AppManager } from './start.js';
import { parseSchema } from './parser.js';
import { setNodeShaderCode } from './editor.js';

export let schemaText : string;
let afterFrame : (()=>void) | undefined;

export function setAfterFrame(fnc : ()=>void){
    afterFrame = fnc;
}

export async function bootstrap(sim: SimulationSchema) {
    const runner = new SimulationRunner();

    runner.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;   

    new CaptureTool(runner);

    if(sim.uis){
        makeUIs(runner, sim);
    }

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

        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);
        const nums = matrices.viewProjection.concat(matrices.view);
        writeUniformArray('Camera', nums)

        runner.currentCommandEncoder = theDevice.createCommandEncoder();

        while (true) {

            runner.setTime();

            const result = runner.generator!.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;
        }

        const renders = runner.getRenders();
        for(const [idx, render] of renders.entries()){
            if(render.vertexCount == undefined){
                throw new MyError();
            }
            theRunner.render(render.id, render.vertexCount, render.instanceCount, true, idx == 0, render.canvasId);
        }

        theDevice.queue.submit([runner.currentCommandEncoder.finish()]);

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
        msg("schema loaded");
        $btn("wizard-btn").disabled = false;
    });

    initEventHandler();
}

export async function initApp(){
    initWebGpuSimsNavigationManager();
    await initWebGpuSims();

    // const text = await fetchText("test/test.js");
    // const schemaDef = parseSchema(text);
    // const schema = new SimulationSchema(theDevice, schemaDef);
    // for(const node of schema.computeNodes()){
    //     msg(`test node:[${node.id}]`);
    //     node.nodeShaderCode = await fetchText(`test/${node.id}.wgsl`);
    // }

    // await bootstrap(schema);
}
