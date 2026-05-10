// src/main.ts
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { OrbitCamera } from './core/camera';
import { CaptureTool } from './core/utils/CaptureTool';
import { ComputePassBuilder } from './core/builder/ComputePassBuilder';
import { RenderPassBuilder } from './core/builder/RenderPassBuilder';
import { SimulationRunner, type SimulationSchema, type ResourceBinding, type PassCommand } from './core/engine/SimulationRunner';

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

    let sim: SimulationSchema;
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

        const simModule = await modules[targetPath]() as { default: SimulationSchema };
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
    for (const node of sim.nodes) {
        // ★ 修正: category ではなく、抽出した directory を使う
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
            // スキーマから topology, blendMode, depthTest を取得
            const hasDepth = node.depthTest !== false;
            const builder = new RenderPassBuilder(device, shader, format, { 
                topology: node.topology || 'triangle-list',
                blendMode: node.blendMode || 'normal',
                depthFormat: hasDepth ? 'depth24plus' : undefined 
            });
            builder.hasDepth = hasDepth; // ループ内で使うためのフラグ

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

    const it = sim.script(runner);

    function frame() {
        const aspect = canvas.width / canvas.height;
        const matrices = camera.getMatrices(aspect);
        runner.updateVariables('Camera', matrices);

        runner.currentCommandEncoder = device.createCommandEncoder();

        while (true) {
            const result = it.next();
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