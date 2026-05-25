// src/main.ts
import { OrbitCamera } from './camera';
import { CaptureTool } from './CaptureTool';
import { ComputePassBuilder, getMesh, RenderPassBuilder, simRunner, writeUniformArray } from './SimulationRunner';
import { SimulationRunner, type ResourceBinding, setRunner, SimulationSchema } from './SimulationRunner';
import { makeUIs } from './SimUI';
import { $txt, assert, fetchText, isRenderMesh, MeshDef, MyError, UniformDef } from './utils';
import { parseSchema } from './parser';
import { captureThumbnail, captureThumbnailFlag } from './start';
import { makeWgslSkeleton } from './generate_skeleton';

export let theSchema : SimulationSchema;

export async function bootstrap(jsonText:string, wgslText : string) {
    const runner = new SimulationRunner();
    if (!await runner.init()) return;

    runner.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    let sim: SimulationSchema;
    try {

        const k = jsonText.indexOf("//# sourceMappingURL=data:application/json;");
        if(k != -1){
            jsonText = jsonText.substring(0, k);
        }
        $txt("schema-text").value = jsonText;

        const schemaDef = await parseSchema(jsonText);
        sim = new SimulationSchema(runner.device, schemaDef);
    } catch (e) {
        console.error(`Failed to load schema:`, e);
        alert(`Schema not found.`);
        return;
    }

    makeWgslSkeleton(sim);

    new CaptureTool(runner);

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
        let shader : string;

        if (node.type === 'compute'){

            shader = wgslText;
            // shader = await fetchText("tmp/json/pendulum/pendulum_comp.wgsl");
            $txt("wgsl-text").value = shader;
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
                default:
                    throw new MyError();
                }
            }
            else{
                throw new MyError();
            }

            const shaderUrl = `src/wgsl/${fileName}`;
            shader = await fetchText(shaderUrl);
        }
        else{
            throw new MyError();
        }
        
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
            node.initRenderPass(runner.device, shader, format, { 
                topology: node.topology,
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

        const renders = runner.getRenders();
        for(const [idx, render] of renders.entries()){
            if(render.vertexCount == undefined){
                throw new MyError();
            }
            simRunner.render(render.id, render.vertexCount, render.instanceCount, true, idx == 0, render.canvasId);
        }

        runner.device.queue.submit([runner.currentCommandEncoder.finish()]);

        if(captureThumbnailFlag){
            captureThumbnail();
        }
        
        runner.currentCommandEncoder = null;
        requestAnimationFrame(frame);
    }

    frame();
}
