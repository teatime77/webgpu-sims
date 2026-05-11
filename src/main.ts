// src/main.ts
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { OrbitCamera } from './core/camera';
import { CaptureTool } from './core/utils/CaptureTool';
import { ComputePassBuilder } from './core/builder/ComputePassBuilder';
import { RenderPassBuilder } from './core/builder/RenderPassBuilder';
import { SimulationRunner, type SimulationSchema, type ResourceBinding, type PassCommand } from './core/engine/SimulationRunner';
import { makeUIs } from './core/ui/SimUI';

async function bootstrap() {
    const engine = new WebGPUEngine();
    if (!await engine.init()) return;

    engine.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const device = engine.device;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    // ========================================================
    // ★ Parse URL parameters (supporting deep directory hierarchies)
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const schemaPath = urlParams.get('schema') || 'test/ParticleSim';

    // Accurately separate directory and filename based on the last '/' in the path
    const lastSlashIdx = schemaPath.lastIndexOf('/');
    const directory = lastSlashIdx !== -1 ? schemaPath.substring(0, lastSlashIdx) : 'test';
    const schemaName = lastSlashIdx !== -1 ? schemaPath.substring(lastSlashIdx + 1) : schemaPath;

    new CaptureTool(engine, schemaName.toLowerCase());

    // ========================================================
    // ★ Dynamic loading of simulation schema (Vite compliant)
    // ========================================================
    const modules = import.meta.glob('./materials/**/*.ts');

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
        sim = simModule.default;
    } catch (e) {
        console.error(`Failed to load schema: ${schemaPath}`, e);
        alert(`Schema "${schemaPath}" not found.`);
        return;
    }

    const runner = new SimulationRunner(engine);
    await runner.loadSchema(sim); 

    if(sim.uis){
        makeUIs(runner, sim);
    }

    const format = runner.getFormat();

    // ========================================================
    // ★ Build passes (Builder)
    // ========================================================
    for (const node of sim.nodes) {
        // ★ Fix: Use the extracted directory instead of category
        const shaderUrl = `./src/materials/${directory}/${node.id}.wgsl`;
        const shader = await (await fetch(shaderUrl)).text();
        
        if (node.type === 'compute') {
            const builder = new ComputePassBuilder(device, shader, 'main');
            const groups = new Set<number>(node.bindings.map((b: ResourceBinding) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g);
                node.bindings.filter((b: ResourceBinding) => (b.group || 0) === g).forEach((b: ResourceBinding) => {
                    const res = sim.resources[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            runner.passes.set(node.id, builder);
        } else {
            // Get topology, blendMode, depthTest from schema
            const hasDepth = node.depthTest !== false;
            const builder = new RenderPassBuilder(device, shader, format, { 
                topology: node.topology || 'triangle-list',
                blendMode: node.blendMode || 'normal',
                depthFormat: hasDepth ? 'depth24plus' : undefined 
            });
            builder.hasDepth = hasDepth; // Flag for use inside the loop

            const groups = new Set<number>(node.bindings.map((b: ResourceBinding) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g);
                node.bindings.filter((b: ResourceBinding) => (b.group || 0) === g).forEach((b: ResourceBinding) => {
                    const res = sim.resources[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            runner.passes.set(node.id, builder);
        }
    }

    runner.generator = sim.script(runner);

    function frame() {
        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);
        runner.updateVariables('Camera', matrices);

        runner.currentCommandEncoder = device.createCommandEncoder();

        while (true) {
            const result = runner.generator!.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;
        }

        device.queue.submit([runner.currentCommandEncoder.finish()]);
        runner.currentCommandEncoder = null;
        requestAnimationFrame(frame);
    }

    frame();
}

bootstrap();