// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';

// Object to hold simulation state
const state = {
    orbitalMode: 0.0,    // ★ Changed from 1.0 (2p) to 0.0 (1s)
    samplingStep: 0.15,
    brightness: 0.05,
    colorMix: 0.5,
    needsReset: 1.0     // ★ Changed from false to true (trigger burn-in right after loading)
};

const NUM_PARTICLES = 1000000;

const schema: SimulationSchema = {
    name: "Hydrogen Orbital V1.5",

    // ========================================================
    // 1. Resource definition (Padding calculation not needed!)
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
    uis:[
        { type: "select", obj:state, name:"orbitalMode", label: "Orbital", reset:true, options: [
            { value: 0, text: "1s (spherical)" },
            { value: 1, text: "2p_z (dumbbell)" },
            { value: 2, text: "3d_z2 (donut+lobes)" }
        ]}
        ,
        { type: "range", obj:state, name:"samplingStep", label: "Sampling Step", min:0.01, max:1.0, step:0.01 },
        { type: "range", obj:state, name:"brightness"  , label: "Brightness"   , min: 0.001, max: 0.2, step: 0.001 },
        { type: "range", obj:state, name:"colorMix"    , label: "Color Mix"    , min: 0.0, max: 1.0, step: 0.01 }
    ]
    ,
    // ========================================================
    // 4. Execution generator (MCMC burn-in orchestration)
    // ========================================================
    script: function* () {
        const dispatchX = Math.ceil(NUM_PARTICLES / 64);

        // Initialize random number state buffer
        const rngState = new Uint32Array(NUM_PARTICLES);
        for (let i = 0; i < NUM_PARTICLES; i++) {
            rngState[i] = Math.random() * 0xFFFFFFFF;
        }
        writeStorage('RngState', rngState);

        state.needsReset = 1.0;
        writeUniformObject('Params', state);
        compute('hydrogen_orbital_comp', dispatchX);
        yield 'frame';

        state.needsReset = 0.0;

        while (true) {
            writeUniformObject('Params', state);
            compute('hydrogen_orbital_comp', dispatchX);

            // Rendering (Vertex count is NUM_PARTICLES since it's point-list)
            render('hydrogen_orbital_render', NUM_PARTICLES, 1, false);
            
            yield 'frame';
        }
    }
};

export default schema;