// src/main.ts
import { OrbitCamera } from './core/camera';
import { assert, CaptureTool } from './core/CaptureTool';
import { ComputePassBuilder, getMesh, RenderPassBuilder, writeUniformArray } from './core/SimulationRunner';
import { SimulationRunner, type ResourceBinding, setRunner, renderMesh, SimulationSchema } from './core/SimulationRunner';
import { makeUIs } from './core/SimUI';
import { MeshDef, MyError, UniformDef } from './core/utils';
import { parseSchema } from './core/parser';

export let theSchema : SimulationSchema;

async function bootstrap() {
    const runner = new SimulationRunner();
    if (!await runner.init()) return;

    runner.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    // ========================================================
    // ★ Parse URL parameters (supporting deep directory hierarchies)
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);

    let sim: SimulationSchema;
    let jsonPath : string | null = null;
    try {

        jsonPath = urlParams.get("json")!;
        assert(jsonPath != null)
        const schemaDef = await parseSchema(`${jsonPath}.js`);
        sim = new SimulationSchema(runner.device, schemaDef);
    } catch (e) {
        console.error(`Failed to load schema: ${jsonPath}`, e);
        alert(`Schema "${jsonPath}" not found.`);
        return;
    }

    const k = jsonPath.lastIndexOf('/');
    const jsonDir = jsonPath.substring(0, k);
    const jsonName = jsonPath.substring(k + 1);

    new CaptureTool(runner, jsonName);

    theSchema = sim;

    runner.schema = sim; 
    setRunner(runner);

    if(sim.uis){
        makeUIs(runner, sim);
    }

    const format = runner.getFormat();

    // ========================================================
    // ★ Build passes (Builder)
    // ========================================================
    for (const node of sim.shaders) {
        let shaderUrl : string;
        if (node.type === 'compute'){

            shaderUrl = `${jsonDir}/${node.id}.wgsl`;
        }
        else if(node.type == "render"){
            const mesh = getMesh(node);
            if(mesh != undefined){

                let fileName : string;
                switch(mesh.shape){
                case "sphere": fileName = "sphere_render.wgsl"; break;
                case "tube"  : fileName = "tube_render.wgsl"; break;
                case "arrow" : fileName = "arrow_render.wgsl"; break;
                default: throw new MyError();
                }
                shaderUrl = `./src/core/wgsl/${fileName}`;
            }
            else{
                throw new MyError();
            }
        }
        else{
            throw new MyError();
        }
        const shader = await (await fetch(shaderUrl)).text();
        
        if (node instanceof ComputePassBuilder) {
            node.initComputePass(runner.device, shader, 'main');
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
            node.initRenderPass(runner.device, node, shader, format, { 
                topology: node.topology || 'triangle-list',
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
        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);
        const nums = matrices.viewProjection.concat(matrices.view);
        writeUniformArray('Camera', nums)

        runner.currentCommandEncoder = runner.device.createCommandEncoder();

        while (true) {

            runner.setTime();

            const result = runner.generator!.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;
        }

        const meshRenders = runner.getMeshRenders();
        for(const [idx, render] of meshRenders.entries()){
            renderMesh(render.node.id, idx == 0);
        }

        runner.device.queue.submit([runner.currentCommandEncoder.finish()]);
        runner.currentCommandEncoder = null;
        requestAnimationFrame(frame);
    }

    frame();
}

bootstrap();