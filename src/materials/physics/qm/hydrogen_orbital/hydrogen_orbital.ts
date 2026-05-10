// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts
import { SimUI } from '../../../../core/ui/SimUI';
import { defineSimulation } from '../../../../core/engine/SimulationRunner';

// Object to hold simulation state
const state = {
    orbitalMode: 0.0,    // ★ Changed from 1.0 (2p) to 0.0 (1s)
    samplingStep: 0.15,
    brightness: 0.05,
    colorMix: 0.5,
    needsReset: true     // ★ Changed from false to true (trigger burn-in right after loading)
};

const NUM_PARTICLES = 1000000;

export default defineSimulation({
    name: "Hydrogen Orbital V1.5",

    // ========================================================
    // 1. Resource definition (Padding calculation not needed!)
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                orbitalMode: 'f32', samplingStep: 'f32', brightness: 'f32', colorMix: 'f32', 
                resetFlag: 'f32', pad1: 'f32', pad2: 'f32', pad3: 'f32' 
            } 
        },
        ParticleData: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        RngState: { type: 'storage', format: 'u32', count: NUM_PARTICLES }
    },

    // ========================================================
    // 2. Node (pass) definitions
    // ========================================================
    nodes: [
        {
            id: 'hydrogen_orbital_comp',
            type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'Params', varName: 'params' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read_write' },
                { group: 0, binding: 2, resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'hydrogen_orbital_render',
            type: 'render',
            topology: 'point-list',
            blendMode: 'add',
            depthTest: false, // Depth not needed for point drawing (additive blending)
            bindings: [
                { group: 0, binding: 0, resource: 'Camera', varName: 'camera' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read' },
                { group: 0, binding: 3, resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. Initialization logic (UI and random seed)
    // ========================================================
    init: async (runner) => {
        // Initialize random number state buffer
        const rngState = new Uint32Array(NUM_PARTICLES);
        for (let i = 0; i < NUM_PARTICLES; i++) {
            rngState[i] = Math.random() * 0xFFFFFFFF;
        }
        runner.writeStorage('RngState', rngState);

        // Construct UI panel
        const ui = new SimUI();
        ui.addSelect("Orbital", [
            { value: 0, text: "1s (spherical)" },
            { value: 1, text: "2p_z (dumbbell)" },
            { value: 2, text: "3d_z2 (donut+lobes)" }
        ], state.orbitalMode, v => {
            state.orbitalMode = v;
            state.needsReset = true; // Require burn-in upon switching
        });
        ui.addRange("Sampling Step", 0.01, 1.0, 0.01, state.samplingStep, v => state.samplingStep = v);
        ui.addRange("Brightness", 0.001, 0.2, 0.001, state.brightness, v => state.brightness = v);
        ui.addRange("Color Mix", 0.0, 1.0, 0.01, state.colorMix, v => state.colorMix = v);
    },

    // ========================================================
    // 4. Execution generator (MCMC burn-in orchestration)
    // ========================================================
    script: function* (runner) {
        const dispatchX = Math.ceil(NUM_PARTICLES / 64);

        while (true) {
            let currentResetFlag = 0.0;
            if (state.needsReset) currentResetFlag = 1.0;

            // Transfer the latest UI values to the GPU
            const paramData = new Float32Array([
                state.orbitalMode, state.samplingStep, state.brightness, state.colorMix,
                currentResetFlag, 0.0, 0.0, 0.0
            ]);
            runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, paramData);

            if (state.needsReset) {
                // 1. Randomly reposition all particles (resetFlag = 1.0)
                runner.compute('hydrogen_orbital_comp', dispatchX);
                
                // 2. Reset the flag to 0
                const resetParamData = new Float32Array([
                    state.orbitalMode, state.samplingStep, state.brightness, state.colorMix,
                    0.0, 0.0, 0.0, 0.0
                ]);
                runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, resetParamData);
                
                // 3. Fast burn-in (Run calculations 16 times within 1 frame for immediate convergence)
                for (let i = 0; i < 16; i++) {
                    runner.compute('hydrogen_orbital_comp', dispatchX);
                }
                state.needsReset = false;
            } else {
                // Normal sampling
                runner.compute('hydrogen_orbital_comp', dispatchX);
            }

            // Rendering (Vertex count is NUM_PARTICLES since it's point-list)
            runner.render('hydrogen_orbital_render', NUM_PARTICLES, 1, false);
            
            yield 'frame';
        }
    }
});