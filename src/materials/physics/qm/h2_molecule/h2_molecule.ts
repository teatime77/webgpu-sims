// src/materials/physics/qm/h2_molecule/h2_molecule.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';

const state = {
    orbitalType: 0.0,    // 0 = Bonding (σg), 1 = Antibonding (σu*)
    bondLength: 1.4,     // In Bohr radii (a0). 1.4 a0 ≈ 0.74 Å (equilibrium bond length of H2)
    samplingStep: 0.25,
    brightness: 0.02,
    colorMix: 0.5,
    needsReset: 1.0      // Float flag to trigger a global scatter when parameters change
};

// 1 Million particles to create a smooth, fuzzy electron probability cloud
const NUM_PARTICLES = 1000000;
const dispatchX = Math.ceil(NUM_PARTICLES / 64);

const schema: SimulationSchema = {
    name: "H2 Molecule Electron Cloud (Hartree-Fock LCAO)",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            obj : state
        },
        ParticleData: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        RngState: { type: 'storage', format: 'u32', count: NUM_PARTICLES }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'h2_hf_comp',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'ParticleData', varName: 'particles', access: 'read_write' },
                { resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'h2_hf_render',
            type: 'render',
            topology: 'point-list', // Best for fuzzy probability clouds
            blendMode: 'add',       // Additive blending creates the glowing density effect
            depthTest: false,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'ParticleData', varName: 'particles', access: 'read' },
                { resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "select", obj: state, name: "orbitalType", label: "Molecular Orbital", reset: true, options: [
            { value: 0, text: "Bonding (σ_g)" },
            { value: 1, text: "Antibonding (σ_u*)" }
        ]},
        { type: "range", obj: state, name: "bondLength", label: "Nuclei Distance (Bohr)", min: 0.1, max: 4.0, step: 0.1 },
        { type: "range", obj: state, name: "samplingStep", label: "MCMC Step Size", min: 0.05, max: 1.0, step: 0.01 },
        { type: "range", obj: state, name: "brightness", label: "Brightness", min: 0.001, max: 0.1, step: 0.001 },
        { type: "range", obj: state, name: "colorMix", label: "Color Phase", min: 0.0, max: 1.0, step: 0.01 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {

        // Initialize random number state buffer for the MCMC algorithm
        const rngState = new Uint32Array(NUM_PARTICLES);
        for (let i = 0; i < NUM_PARTICLES; i++) {
            rngState[i] = Math.random() * 0xFFFFFFFF;
        }
        writeStorage('RngState', rngState);

        // Burn-in pass: scatter particles instantly to match the distribution
        state.needsReset = 1.0;
        writeUniformObject('Params', state);

        compute('h2_hf_comp');
        yield 'frame';

        state.needsReset = 0.0;

        // Main execution loop
        while (true) {
            // Write 0.0 to needsReset during normal execution to perform standard MCMC steps
            writeUniformObject('Params', state);
            
            compute('h2_hf_comp');
            render('h2_hf_render', NUM_PARTICLES, 1, false);
            
            yield 'frame';
        }
    }
};

export default schema;