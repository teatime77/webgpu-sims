// src/materials/test/string_vibration/string_vibration.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../core/SimulationRunner';
import { makeTube } from '../../../core/primitive';

// UI State
const state = {
    time: 0.0,
    amplitude: 1.0,
    frequency: 2.0,
    speed: 1.0,
    segmentLength: 0.02, // Length of each tube segment
    initialize: 1.0,
};

// Simulation constants
const NUM_SEGMENTS = 200;
const TUBE_DIVISIONS = 8;
const TUBE_VERTEX_COUNT = (TUBE_DIVISIONS + 1) * 2; // Derived from makeTube logic

const schema: SimulationSchema = {
    name: "String Vibration Simulation",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                time: 'f32', 
                amplitude: 'f32', 
                frequency: 'f32', 
                speed: 'f32',
                segmentLength: 'f32',
                initialize: 'f32'
            } 
        },
        // We use vec4<f32> for positions and directions to ensure correct 16-byte memory alignment
        Positions: { type: 'storage', format: 'vec4<f32>', count: NUM_SEGMENTS },
        Directions: { type: 'storage', format: 'vec4<f32>', count: NUM_SEGMENTS },
        TubeMesh: { type: 'storage', format: 'f32', count: TUBE_VERTEX_COUNT * 6 } // 3 pos + 3 norm per vertex
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
nodes: [
        {
            id: 'string_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'Positions', varName: 'positions', access: 'read_write' },
                { resource: 'Directions', varName: 'directions', access: 'read_write' }
            ]
        },
        {
            id: 'string_render',
            type: 'render',
            topology: 'triangle-strip',
            blendMode: 'opaque',
            depthTest: true,
            bindings: [
                // REMOVED the Params binding here!
                { resource: 'Camera', varName: 'camera' },
                { resource: 'Positions', varName: 'positions', access: 'read' },
                { resource: 'Directions', varName: 'directions', access: 'read' },
                { resource: 'TubeMesh', varName: 'tubeMesh', access: 'read' }
            ]
        }
    ],
    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "range", obj: state, name: "speed", label: "Simulation Speed", min: 0.0, max: 5.0, step: 0.1 },
        { type: "range", obj: state, name: "amplitude", label: "Wave Amplitude", min: 0.0, max: 3.0, step: 0.1 },
        { type: "range", obj: state, name: "frequency", label: "Wave Frequency", min: 0.1, max: 10.0, step: 0.1 },
        { type: "range", obj: state, name: "segmentLength", label: "Segment Length", min: 0.001, max: 0.02, step: 0.001 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {
        const dispatchX = Math.ceil(NUM_SEGMENTS / 64);

        // Load the Tube Mesh
        const tubeGeom = makeTube(TUBE_DIVISIONS);
        writeStorage('TubeMesh', tubeGeom);

        // 1. Initialization Compute Pass
        state.initialize = 1.0;
        writeUniformObject('Params', state);            
        compute('string_compute', dispatchX);

        yield 'frame';

        // 2. Setup for main execution loop
        state.initialize = 0.0;

        // 3. Main execution loop
        while (true) {
            state.time += 0.016 * state.speed; 

            writeUniformObject('Params', state);            
            
            // Calculate wave positions and tangents
            compute('string_compute', dispatchX);
            
            // Draw NUM_SEGMENTS instances of the tube segment
            render('string_render', TUBE_VERTEX_COUNT, NUM_SEGMENTS, true);
            
            yield 'frame';
        }
    }
};

export default schema;