// src/main.ts
import { OrbitCamera } from './core/camera';
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { ParticleSim } from './materials/test/ParticleSim';
import { CaptureTool } from './core/utils/CaptureTool';
import { HydrogenOrbitalSim } from './materials/physics/qm/hydrogen_orbital/hydrogen_orbital';

async function bootstrap() {
    const engine = new WebGPUEngine();
    if (!await engine.init()) return;

    engine.addCanvas('main-canvas');

    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;

    // ★ カメラのインスタンス化
    const camera = new OrbitCamera(canvas);
    camera.distance = 5.0; // 今回のパーティクルは±1の範囲にいるので少し近づける

    // const sim = new ParticleSim();
    const sim = new HydrogenOrbitalSim();
    await sim.init(engine);

    // キャプチャツールを初期化 (プレフィックス名を指定)
    new CaptureTool(engine, 'particle');

    function frame() {
        const aspect = canvas.width / canvas.height;
        // ★ 毎フレーム、マウス操作が反映された最新の行列を取得
        const matrices = camera.getMatrices(aspect);

        // ★ シミュレーションに行列を渡す
        sim.update(engine, matrices);

        requestAnimationFrame(frame);
    }
    frame();
}

bootstrap();