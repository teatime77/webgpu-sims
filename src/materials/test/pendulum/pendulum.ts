// src/materials/test/pendulum/pendulum.ts
import { compute, writeUniformObject, type SimulationSchema } from '../../../core/SimulationRunner';

// UI State
const state = {
    dt: 0.016,
    gravity: 9.81,
    baseLength: 4.0,
    bobRadius: 0.4,
    stringThickness: 0.05,
    time: 0.0,
};

const NUM_PENDULUMS = 10;
const dispatchX = Math.ceil(NUM_PENDULUMS / 64);

const TUBE_DIVISIONS = 16;
const TUBE_VERTEX_COUNT = (TUBE_DIVISIONS + 1) * 2;
const BOB_FACES = 320;
const BOB_VERTEX_COUNT = BOB_FACES * 3;
const TUBE_STRIDE = 12;
const SPHERE_STRIDE = 8;

const schema: SimulationSchema = {
    name: "Pendulum Wave (Material Architecture)",

    resources: {
        Params: { 
            type: 'uniform', 
            obj : state
        },
        PendulumState: { type: 'storage', format: 'vec4<f32>', count: NUM_PENDULUMS },
        Tubes: { type: 'storage', format: 'f32', count: NUM_PENDULUMS * TUBE_STRIDE },
        Spheres: { type: 'storage', format: 'f32', count: NUM_PENDULUMS * SPHERE_STRIDE },
        TubeMesh: { type: 'mesh', shape:"tube", division:TUBE_DIVISIONS, count: TUBE_VERTEX_COUNT * 6 },
        SphereMesh: { type: 'mesh', shape: 'sphere', count: BOB_VERTEX_COUNT * 6 }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'pendulum_comp',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'PendulumState', varName: 'stateBuffer', access: 'read_write' },
                { resource: 'Tubes', access: 'read_write' },
                { resource: 'Spheres', access: 'read_write' }
            ]
        },
        {
            id: 'tube_render',
            type: 'render',
            vertexCount: TUBE_VERTEX_COUNT,
            instanceCount: NUM_PENDULUMS,
            bindings: [
                { resource: 'Camera' },
                { resource: 'Tubes', varName: 'instances' },
                { resource: 'TubeMesh', varName: 'vertexData' }
            ]
        },
        {
            id: 'bob_render',
            type: 'render',
            vertexCount: BOB_VERTEX_COUNT,
            instanceCount: NUM_PENDULUMS,
            bindings: [
                { resource: 'Camera' },
                { resource: 'Spheres', varName: 'instances' },
                { resource: 'SphereMesh', varName: 'vertexData' }
            ]
        }
    ],

    uis:[
        { type: "range", obj: state, name: "gravity", label: "Gravity", min: 1.0, max: 20.0, step: 0.1 },
        { type: "range", obj: state, name: "baseLength", label: "String Length", min: 1.0, max: 10.0, step: 0.1 },
        { type: "range", obj: state, name: "bobRadius", label: "Bob Size", min: 0.1, max: 1.0, step: 0.05 },
        { type: "range", obj: state, name: "stringThickness", label: "String Thickness", min: 0.01, max: 0.2, step: 0.01 }
    ],

    script: function* () {

        // Main Loop
        while (true) {
            writeUniformObject('Params', state);            
            
            compute('pendulum_comp');
            
            yield 'frame';
        }
    }
};

export default schema;