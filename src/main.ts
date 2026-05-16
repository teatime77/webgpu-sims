// src/main.ts
import { OrbitCamera } from './core/camera';
import { CaptureTool } from './core/CaptureTool';
import { ComputePassBuilder, getMesh, RenderPassBuilder, writeUniformArray, writeUniformObject } from './core/SimulationRunner';
import { SimulationRunner, type ResourceBinding, setRunner, renderMesh, SimulationSchema } from './core/SimulationRunner';
import { makeUIs } from './core/SimUI';
import { MeshDef, MyError, UniformDef } from './core/utils';
import { testParser } from './core/parser';

export let theSchema : SimulationSchema;

async function bootstrap() {
    await testParser();

    const runner = new SimulationRunner();
    if (!await runner.init()) return;

    runner.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    // ========================================================
    // ★ Dynamic loading of simulation schema (Vite compliant)
    // ========================================================
    const modules = import.meta.glob('./materials/**/*.ts');

    // ========================================================
    // ★ Parse URL parameters (supporting deep directory hierarchies)
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const schemaParam = urlParams.get('schema');
    const idxStr = urlParams.get("idx");

    let schemaPaths : string[] = [];

    if (!schemaParam || idxStr != undefined) {
        schemaPaths = Object.keys(modules).map(key => {
            return key.replace(/^\.\/materials\//, '').replace(/\.ts$/, '');
        }).sort();

        if(!schemaParam){
            const container = document.getElementById('schema-selector-container');
            const select = document.getElementById('schema-select') as HTMLSelectElement;
            
            if (container && select) {

                if(urlParams.has("all")){
                    window.location.href = `?schema=${schemaPaths[0]}&idx=0`;
                    return;
                }

                for (const path of schemaPaths) {
                    const option = document.createElement('option');
                    option.value = path;
                    option.innerText = path;
                    select.appendChild(option);
                }

                select.onchange = () => {
                    if (select.value) {
                        window.location.href = `?schema=${select.value}`;
                    }
                };

                container.style.display = 'block';
            }
            return;
        }
    }

    if(idxStr != undefined){
        const idx = parseInt(idxStr) + 1;
        if(idx < schemaPaths.length){
            setTimeout(()=>{
                window.location.href = `?schema=${schemaPaths[idx]}&idx=${idx}`;
            }, 1000);
        }
    }

    const schemaPath = schemaParam;

    // Accurately separate directory and filename based on the last '/' in the path
    const lastSlashIdx = schemaPath.lastIndexOf('/');
    const directory = lastSlashIdx !== -1 ? schemaPath.substring(0, lastSlashIdx) : 'test';
    const schemaName = lastSlashIdx !== -1 ? schemaPath.substring(lastSlashIdx + 1) : schemaPath;

    new CaptureTool(runner, schemaName.toLowerCase());

    let sim: SimulationSchema;
    try {
        // 1. Search for the specified path exactly (e.g., ./materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts)
        let targetPath = `./materials/${schemaPath}.ts`;
        
        // 2. If not found, append 'Sim.ts' for backward compatibility (e.g., ./materials/test/ParticleSim.ts)
        if (!modules[targetPath]) {
            targetPath = `./materials/${schemaPath}Sim.ts`;
        }

        if (!modules[targetPath]) {
            throw new Error(`Path not found in glob: ${targetPath}`);
        }

        const simModule = await modules[targetPath]() as { default: SimulationSchema };
        sim = new SimulationSchema(simModule.default as any);
    } catch (e) {
        console.error(`Failed to load schema: ${schemaPath}`, e);
        alert(`Schema "${schemaPath}" not found.`);
        return;
    }

    theSchema = sim;

    await runner.loadSchema(sim); 
    setRunner(runner);

    if(sim.uis){
        makeUIs(runner, sim);
    }

    const format = runner.getFormat();

    // ========================================================
    // ★ Build passes (Builder)
    // ========================================================
    for (const node of sim.nodes) {
        let shaderUrl : string;
        if (node.type === 'compute'){

            shaderUrl = `./src/materials/${directory}/${node.id}.wgsl`;
        }
        else if(node.type == "render"){
            const mesh = getMesh(node);
            if(mesh != undefined){

                let fileName : string;
                switch(mesh.shape){
                case "sphere": fileName = "sphere_render.wgsl"; break;
                case "tube"  : fileName = "tube_render.wgsl"; break;
                default: throw new MyError();
                }
                shaderUrl = `./src/core/wgsl/${fileName}`;
            }
            else{

                // ★ Fix: Use the extracted directory instead of category
                shaderUrl = `./src/materials/${directory}/${node.id}.wgsl`;
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