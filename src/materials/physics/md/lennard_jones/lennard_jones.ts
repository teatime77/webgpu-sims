// src/materials/physics/md/lennard_jones/lennard_jones.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';
import { makeGeodesicPolyhedron } from '../../../../core/primitive';

const state = {
    dt: 0.002,
    epsilon: 1.5,       // Depth of the potential well (attraction strength)
    sigma: 0.4,         // Distance where inter-particle potential is zero
    boxSize: 15.0,      // Bounding box size
    damping: 0.999,     // Simple thermostat to drain excess kinetic energy
    initialize: 1.0
};

const NUM_PARTICLES = 8192; // Doubled the particle count for better fluid dynamics
const VERTEX_COUNT = 3840;

const schema: SimulationSchema = {
    name: "Lennard-Jones Binary Mixture",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                dt: 'f32', epsilon: 'f32', sigma: 'f32', boxSize: 'f32', 
                damping: 'f32', initialize: 'f32', pad2: 'f32', pad3: 'f32' 
            } 
        },
        // Positions w-component will store the particle "type" (0.0 or 1.0)
        ParticlePos: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        ParticleVel: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        BaseMesh: { type: 'storage', format: 'f32', count: VERTEX_COUNT * 6 }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'lj_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'ParticlePos', varName: 'positions', access: 'read_write' },
                { resource: 'ParticleVel', varName: 'velocities', access: 'read_write' }
            ]
        },
        {
            id: 'lj_render',
            type: 'render',
            topology: 'triangle-list',
            blendMode: 'add',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'ParticlePos', varName: 'positions', access: 'read' },
                { resource: 'BaseMesh', varName: 'baseMesh', access: 'read' },
                { resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "range", obj: state, name: "dt", label: "Time Step", min: 0.0001, max: 0.01, step: 0.0001 },
        { type: "range", obj: state, name: "epsilon", label: "Attraction (Epsilon)", min: 0.1, max: 5.0, step: 0.1 },
        { type: "range", obj: state, name: "sigma", label: "Particle Size (Sigma)", min: 0.1, max: 1.0, step: 0.05 },
        { type: "range", obj: state, name: "damping", label: "Energy Damping", min: 0.900, max: 1.000, step: 0.001 },
        { type: "range", obj: state, name: "boxSize", label: "Box Size", min: 5.0, max: 30.0, step: 1.0 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {
        const dispatchX = Math.ceil(NUM_PARTICLES / 64);

        writeStorage('BaseMesh', makeGeodesicPolyhedron(1)); // Unit sphere

        state.initialize = 1.0;
        writeUniformObject('Params', state);
        compute('lj_compute', dispatchX);

        yield 'frame';

        state.initialize = 0.0;

        while (true) {
            writeUniformObject('Params', state);
            
            compute('lj_compute', dispatchX);
            render('lj_render', VERTEX_COUNT, NUM_PARTICLES, true);
            
            yield 'frame';
        }
    }
};

export default schema;