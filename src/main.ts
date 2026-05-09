// src/main.ts
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { OrbitCamera } from './core/camera';
import { CaptureTool } from './core/utils/CaptureTool';
import { ComputePassBuilder } from './core/builder/ComputePassBuilder';
import { RenderPassBuilder } from './core/builder/RenderPassBuilder';
import { SimulationRunner } from './core/engine/SimulationRunner'; // ★ 新規追加

import sim from './materials/test/ParticleSim';

async function bootstrap() {
    const engine = new WebGPUEngine();
    if (!await engine.init()) return;

    engine.addCanvas('main-canvas');
    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const device = engine.device;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    new CaptureTool(engine, 'particle');

    // ========================================================
    // ★ 1. Runnerのインスタンス化とスキーマのロード
    // ========================================================
    const runner = new SimulationRunner(engine);
    await runner.loadSchema(sim); 

    const format = runner.getFormat();

    // ========================================================
    // ★ 2. パスの構築 (Builder)
    // ========================================================
    const passes = new Map<string, any>();
    for (const node of sim.nodes) {
        const shader = await (await fetch(`./src/materials/test/${node.id}.wgsl`)).text();
        
        if (node.type === 'compute') {
            const builder = new ComputePassBuilder(device, shader, 'main');
            
            // ★ 修正: バインディングのグループ(0, 1...)ごとに処理を分ける
            const groups = new Set<number>(node.bindings.map((b: any) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g); // ここでグループをセット
                node.bindings.filter((b: any) => (b.group || 0) === g).forEach((b: any) => {
                    const res = (sim.resources as Record<string, any>)[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            passes.set(node.id, builder);
        } else {
            const builder = new RenderPassBuilder(device, shader, format, { depthFormat: 'depth24plus' });
            
            // ★ 修正: Render側も同様にグループをセット
            const groups = new Set<number>(node.bindings.map((b: any) => b.group || 0));
            groups.forEach(g => {
                builder.setGroup(g);
                node.bindings.filter((b: any) => (b.group || 0) === g).forEach((b: any) => {
                    const res = (sim.resources as Record<string, any>)[b.resource];
                    if (res.type === 'uniform') builder.addUniform(runner.getUniformBuffer(b.resource), b.binding);
                    else builder.addStorage(runner.getStorageBuffer(b.resource, b.historyLevel || 0), b.binding);
                });
            });
            passes.set(node.id, builder);
        }
    }

    // ========================================================
    // ★ 3. 実行制御（ジェネレータ）
    // ========================================================
    const context = {
        call: (id: string) => passes.get(id),
        swap: (id: string) => runner.swap(id), // runner.swap を呼ぶ
    };

    const it = sim.script(context);

    function frame() {
        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);

        // ★ カメラの更新 (runner経由でパディング自動計算)
        runner.updateVariables('Camera', matrices);

        const commandEncoder = device.createCommandEncoder();

        while (true) {
            const result = it.next();
            if (result.done) break;
            
            const val = result.value;
            if (val === 'frame') break;

            if (val instanceof ComputePassBuilder) {
                const cPass = commandEncoder.beginComputePass();
                val.dispatch(cPass, Math.ceil(20000 / 64)); // インスタンス数 / 64
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
                val.draw(rPass, 3840, 10000); // 球体頂点数, パーティクル数
                rPass.end();
            }
        }

        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    frame();
}

bootstrap();