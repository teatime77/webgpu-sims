// src/materials/physics/cm/pendulum/pendulum.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';
import { makeTube, makeGeodesicPolyhedron } from '../../../../core/primitive';

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

// Geometry constants
const TUBE_DIVISIONS = 16;
const TUBE_VERTEX_COUNT = (TUBE_DIVISIONS + 1) * 2;

// Geodesic mesh (Subdivisions = 2 results in 320 faces)
const BOB_FACES = 320;
const BOB_VERTEX_COUNT = BOB_FACES * 3;

const schema: SimulationSchema = {
    name: "Pendulum Wave Simulation",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            obj : state,
            fields: { 
                dt: 'f32', 
                gravity: 'f32', 
                baseLength: 'f32', 
                bobRadius: 'f32',
                stringThickness: 'f32',
                time: 'f32'
            } 
        },
        // State holds: [angle (theta), angular_velocity (omega), z_offset, length]
        PendulumState: { type: 'storage', format: 'vec4<f32>', count: NUM_PENDULUMS },
        
        // Base Geometries
        TubeMesh: { type: 'storage', format: 'f32', count: TUBE_VERTEX_COUNT * 6 }, // Pos3 + Norm3
        BobMesh: { type: 'storage', format: 'f32', count: BOB_VERTEX_COUNT * 6 }    // Pos3 + Norm3
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    shaders: [
        {
            id: 'pendulum_compute',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'PendulumState', varName: 'stateBuffer', access: 'read_write' }
            ]
        },
        {
            id: 'string_render',
            type: 'render',
            topology: 'triangle-strip', // Required for makeTube
            blendMode: 'opaque',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'Params', varName: 'params' },
                { resource: 'PendulumState', varName: 'stateBuffer', access: 'read' },
                { resource: 'TubeMesh', varName: 'tubeMesh', access: 'read' }
            ]
        },
        {
            id: 'bob_render',
            type: 'render',
            topology: 'triangle-list', // Required for makeGeodesicPolyhedron
            blendMode: 'opaque',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'Params', varName: 'params' },
                { resource: 'PendulumState', varName: 'stateBuffer', access: 'read' },
                { resource: 'BobMesh', varName: 'bobMesh', access: 'read' }
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "range", obj: state, name: "gravity", label: "Gravity", min: 1.0, max: 20.0, step: 0.1 },
        { type: "range", obj: state, name: "baseLength", label: "String Length", min: 1.0, max: 10.0, step: 0.1 },
        { type: "range", obj: state, name: "bobRadius", label: "Bob Size", min: 0.1, max: 1.0, step: 0.05 },
        { type: "range", obj: state, name: "stringThickness", label: "String Thickness", min: 0.01, max: 0.2, step: 0.01 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {

        // Load Geometries to GPU
        const tubeGeom = makeTube(TUBE_DIVISIONS);
        writeStorage('TubeMesh', tubeGeom);

        // Generate Bob with radius 1.0 (we will scale it dynamically in the shader)
        const bobGeom = makeGeodesicPolyhedron(2);
        writeStorage('BobMesh', bobGeom);

        // 3. Main execution loop
        while (true) {
            writeUniformObject('Params', state);            
            
            // Step physics
            compute('pendulum_compute');
            
            // Draw the strings and the bobs using instancing
            render('string_render', TUBE_VERTEX_COUNT, NUM_PENDULUMS, true, true);
            render('bob_render', BOB_VERTEX_COUNT, NUM_PENDULUMS, true, false);
            
            yield 'frame';
        }
    }
};

export default schema;