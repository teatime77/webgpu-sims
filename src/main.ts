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
    engine.addCanvas('debug-canvas');
    // main.ts の初期化部分に追加
    engine.addCanvas('canvas-k1');
    engine.addCanvas('canvas-k2');
    engine.addCanvas('canvas-k3');
    engine.addCanvas('canvas-prenorm');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const device = engine.device;

    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0;

    // ========================================================
    // ★ URL パラメータの解析（深いディレクトリ階層に対応）
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const schemaPath = urlParams.get('schema') || 'test/ParticleSim';

    // パスの一番最後の '/' を基準に、ディレクトリとファイル名を正確に分離
    const lastSlashIdx = schemaPath.lastIndexOf('/');
    const directory = lastSlashIdx !== -1 ? schemaPath.substring(0, lastSlashIdx) : 'test';
    const schemaName = lastSlashIdx !== -1 ? schemaPath.substring(lastSlashIdx + 1) : schemaPath;

    new CaptureTool(engine, schemaName.toLowerCase());

    // ========================================================
    // ★ シミュレーションスキーマの動的ロード (Vite 準拠)
    // ========================================================
    const modules = import.meta.glob('./materials/**/*.ts');

    let sim: any;
    try {
        // 1. 指定されたパスをそのまま探す (例: ./materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts)
        let targetPath = `./materials/${schemaPath}.ts`;
        
        // 2. 見つからなければ後方互換性のため 'Sim.ts' を付けて探す (例: ./materials/test/ParticleSim.ts)
        if (!modules[targetPath]) {
            targetPath = `./materials/${schemaPath}Sim.ts`;
        }

        if (!modules[targetPath]) {
            throw new Error(`Path not found in glob: ${targetPath}`);
        }

        const simModule: any = await modules[targetPath]();
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
        // ★ 修正: category ではなく、抽出した directory を使う
        const shaderUrl = `./src/materials/${directory}/${node.id}.wgsl`;
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
            // スキーマから topology, blendMode, depthTest を取得
            const hasDepth = node.depthTest !== false;
            const builder = new RenderPassBuilder(device, shader, format, { 
                topology: node.topology || 'triangle-list',
                blendMode: node.blendMode || 'normal',
                depthFormat: hasDepth ? 'depth24plus' : undefined 
            });
            (builder as any).hasDepth = hasDepth; // ループ内で使うためのフラグ

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

            // ★ 修正: オブジェクト形式で動的なディスパッチ・描画数を受け取る
            let passInfo = val;
            if (val instanceof ComputePassBuilder) {
                // 古い ParticleSim の互換性フォールバック
                passInfo = { type: 'compute', builder: val, x: Math.ceil(20000 / 64) };
            } else if (val instanceof RenderPassBuilder) {
                passInfo = { type: 'render', builder: val, vertexCount: 3840, instanceCount: 10000, hasDepth: true };
            }

            if (passInfo.type === 'compute') {
                const cPass = commandEncoder.beginComputePass();
                passInfo.builder.dispatch(cPass, passInfo.x, passInfo.y || 1, passInfo.z || 1);
                cPass.end();
            } else if (passInfo.type === 'render') {
                // ★ スキーマからキャンバスIDを取得（デフォルトは main-canvas）
                const targetCanvas = passInfo.canvas || 'main-canvas'; 
                
                const passDesc: GPURenderPassDescriptor = {
                    colorAttachments: [{
                        view: engine.getContext(targetCanvas).getCurrentTexture().createView(),
                        clearValue: { r: 0.0, g: 0.0, b: 0.01, a: 1.0 },
                        loadOp: 'clear', storeOp: 'store'
                    }]
                };
                
                if (passInfo.hasDepth) {
                    passDesc.depthStencilAttachment = {
                        view: engine.getDepthView(targetCanvas),
                        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
                    };
                }
                
                const rPass = commandEncoder.beginRenderPass(passDesc);
                passInfo.builder.draw(rPass, passInfo.vertexCount, passInfo.instanceCount || 1);
                rPass.end();
            }
        }

        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    frame();
}

bootstrap();