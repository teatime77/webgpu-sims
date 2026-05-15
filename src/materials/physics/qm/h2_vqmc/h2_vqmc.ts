// src/materials/physics/qm/h2_vqmc/h2_vqmc.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';

const state = {
    spinState: 0.0,      // 0 = Singlet (Symmetric Space), 1 = Triplet (Antisymmetric Space via Slater Det)
    bondLength: 1.4,     // Distance between Nucleus A and B (Bohr radii)
    jastrow: 0.5,        // Strength of electron-electron repulsion
    pinX: -0.7,          // UI target to "pin" Electron 1's X coordinate
    pinY: 0.0,           // UI target to "pin" Electron 1's Y coordinate
    pinZ: 0.0,           // UI target to "pin" Electron 1's Z coordinate
    samplingStep: 0.35,  // MCMC step size in 6D space
    brightness: 0.05,
    needsReset: 1.0
};

// 500,000 Walkers (each walker is a PAIR of electrons, so 1 million 3D vectors total)
const NUM_WALKERS = 500000;

const schema: SimulationSchema = {
    name: "H2 VQMC (Slater Determinant & Correlation)",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            obj : state
        },
        // We now store TWO buffers to represent a 6D walker configuration
        Electron1Pos: { type: 'storage', format: 'vec4<f32>', count: NUM_WALKERS },
        Electron2Pos: { type: 'storage', format: 'vec4<f32>', count: NUM_WALKERS },
        RngState: { type: 'storage', format: 'u32', count: NUM_WALKERS }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'vqmc_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'Electron1Pos', varName: 'e1_pos', access: 'read_write' },
                { resource: 'Electron2Pos', varName: 'e2_pos', access: 'read_write' },
                { resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'vqmc_render',
            type: 'render',
            topology: 'point-list',
            blendMode: 'add',
            depthTest: false,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'Electron1Pos', varName: 'e1_pos', access: 'read' },
                { resource: 'Electron2Pos', varName: 'e2_pos', access: 'read' },
                { resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "select", obj: state, name: "spinState", label: "Spin State", reset: true, options: [
            { value: 0, text: "Singlet (↑↓) - Symmetric" },
            { value: 1, text: "Triplet (↑↑) - Antisymmetric Det" }
        ]},
        { type: "range", obj: state, name: "jastrow", label: "e-e Repulsion (Jastrow)", min: 0.0, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "bondLength", label: "Nuclei Distance", min: 0.5, max: 4.0, step: 0.1 },
        // These UI sliders let the user move the "pinned" electron and watch the other electron react!
        { type: "range", obj: state, name: "pinX", label: "Pin Electron 1 (X)", min: -2.0, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "pinY", label: "Pin Electron 1 (Y)", min: -2.0, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "pinZ", label: "Pin Electron 1 (Z)", min: -2.0, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "samplingStep", label: "MCMC Step Size", min: 0.1, max: 1.5, step: 0.05 },
        { type: "range", obj: state, name: "brightness", label: "Brightness", min: 0.01, max: 0.2, step: 0.01 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {
        const dispatchX = Math.ceil(NUM_WALKERS / 64);

        // Initialize random states
        const rngState = new Uint32Array(NUM_WALKERS);
        for (let i = 0; i < NUM_WALKERS; i++) {
            rngState[i] = Math.random() * 0xFFFFFFFF;
        }
        writeStorage('RngState', rngState);

        // Burn-in pass (Scatter walkers randomly in 6D space)
        state.needsReset = 1.0;
        writeUniformObject('Params', state);

        compute('vqmc_compute', dispatchX);
        yield 'frame';

        state.needsReset = 0.0;
        while (true) {
            writeUniformObject('Params', state);
            
            // 1. Move both electrons in 6D space according to the Slater Det * Jastrow
            compute('vqmc_compute', dispatchX);
            
            // 2. Render Electron 2, filtering based on where Electron 1 is
            render('vqmc_render', NUM_WALKERS, 1, false);
            
            yield 'frame';
        }
    }
};

export default schema;