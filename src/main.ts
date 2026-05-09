// src/main.ts
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { OrbitCamera } from './core/camera';
import { CaptureTool } from './core/utils/CaptureTool';
import { ComputePassBuilder } from './core/builder/ComputePassBuilder';
import { RenderPassBuilder } from './core/builder/RenderPassBuilder';
import { SimulationRunner } from './core/engine/SimulationRunner';

async function bootstrap() {
    const engine = new WebGPUEngine();
    if (!await engine.init()) return;

    engine.addCanvas('main-canvas');
    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const device = engine.device;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    // ========================================================
    // ★ URL パラメータの解析
    // ?schema=test/Particle の形式を想定（デフォルトは test/Particle）
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const schemaPath = urlParams.get('schema') || 'test/Particle';
    const [category, schemaName] = schemaPath.includes('/') 
        ? schemaPath.split('/') 
        : ['test', schemaPath];

    new CaptureTool(engine, schemaName.toLowerCase());

    // ========================================================
    // ★ シミュレーションスキーマの動的ロード
    // ========================================================
    let sim: any;
    try {
        // Vite の動的インポートを利用
        const simModule = await import(`./materials/${category}/${schemaName}Sim.ts`);
        sim = simModule.default;
    } catch (e) {
        console.error(`Failed to load schema: ${schemaPath}`, e);
        alert(`Schema "${schemaPath}" not found.`);
        return;
    }

    const runner = new SimulationRunner(engine);
    await runner.loadSchema(sim); 

    const format = runner.getFormat();

    // ========================================================
    // ★ パスの構築 (Builder)
    // ========================================================
    const passes = new Map<string, any>();
    for (const node of sim.nodes) {
        // シェーダーファイルもカテゴリディレクトリから動的に取得
        const shaderUrl = `./src/materials/${category}/${node.id}.wgsl`;
        const shader = await (await fetch(shaderUrl)).text();
        
        if (node.type === 'compute') {
            const builder = new ComputePassBuilder(device, shader, 'main');
            const groups = new Set<number>(node.bindings.map((b: any) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g);
                node.bindings.filter((b: any) => (b.group || 0) === g).forEach((b: any) => {
                    const res = sim.resources[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            passes.set(node.id, builder);
        } else {
            const builder = new RenderPassBuilder(device, shader, format, { depthFormat: 'depth24plus' });
            const groups = new Set<number>(node.bindings.map((b: any) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g);
                node.bindings.filter((b: any) => (b.group || 0) === g).forEach((b: any) => {
                    const res = sim.resources[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            passes.set(node.id, builder);
        }
    }

    const context = {
        call: (id: string) => passes.get(id),
        swap: (id: string) => runner.swap(id),
    };

    const it = sim.script(context);

    function frame() {
        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);
        runner.updateVariables('Camera', matrices);

        const commandEncoder = device.createCommandEncoder();

        while (true) {
            const result = it.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;

            if (val instanceof ComputePassBuilder) {
                const cPass = commandEncoder.beginComputePass();
                // ワークグループサイズなどは必要に応じてスキーマから取得するように拡張可能
                val.dispatch(cPass, Math.ceil(20000 / 64)); 
                cPass.end();
            } else if (val instanceof RenderPassBuilder) {
                const rPass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        view: engine.getContext('main-canvas').getCurrentTexture().createView(),
                        clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
                        loadOp: 'clear', storeOp: 'store'
                    }],
                    depthStencilAttachment: {
                        view: engine.getDepthView('main-canvas'),
                        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
                    }
                });
                // 頂点数などは sim の初期化時に保持した値を使用
                val.draw(rPass, 3840, 10000); 
                rPass.end();
            }
        }

        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    frame();
}

bootstrap();