// src/main.ts
import { WebGPUEngine } from './core/engine/WebGPUEngine';
import { ParticleSim } from './materials/test/ParticleSim';

async function bootstrap() {
    const engine = new WebGPUEngine();
    if (!await engine.init()) return;

    engine.addCanvas('main-canvas');

    const sim = new ParticleSim();
    await sim.init(engine);

    function frame() {
        sim.update(engine);
        requestAnimationFrame(frame);
    }
    frame();
}

bootstrap();