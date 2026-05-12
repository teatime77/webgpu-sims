// src/materials/test/surface/surface.ts
import { compute, render, writeUniformObject, type SimulationSchema } from '../../../core/engine/SimulationRunner';

// UI State
const state = {
    time: 0.0,
    speed: 1.0,
    amplitude: 1.0,
    frequency: 1.0,
    initialize: 1.0,
};

// A high-density grid for a perfectly smooth, silky surface
// 200x200 grid = 40,000 quads = 80,000 triangles = 240,000 vertices
const GRID_SIZE = 200;
const NUM_VERTICES = GRID_SIZE * GRID_SIZE * 6;

const schema: SimulationSchema = {
    name: "Procedural Wave Surface",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                time: 'f32', speed: 'f32', amplitude: 'f32', frequency: 'f32', initialize: 'f32'
            } 
        },
        // BaseGrid holds the static (X, 0, Z) flat plane coordinates
        BaseGrid: { type: 'storage', format: 'vec4<f32>', count: NUM_VERTICES },
        // The compute shader writes the animated (X, Y, Z) and Normals here
        Positions: { type: 'storage', format: 'vec4<f32>', count: NUM_VERTICES },
        Normals: { type: 'storage', format: 'vec4<f32>', count: NUM_VERTICES }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'wave_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'BaseGrid', varName: 'baseGrid', access: 'read_write' },
                { resource: 'Positions', varName: 'positions', access: 'read_write' },
                { resource: 'Normals', varName: 'normals', access: 'read_write' }
            ]
        },
        {
            id: 'wave_render',
            type: 'render',
            topology: 'triangle-list',
            blendMode: 'opaque',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'Positions', varName: 'positions', access: 'read' },
                { resource: 'Normals', varName: 'normals', access: 'read' }
                // Notice we don't bind 'Params' here to avoid the WebGPU dead-code elimination trap!
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "range", obj: state, name: "speed", label: "Wave Speed", min: 0.0, max: 5.0, step: 0.1 },
        { type: "range", obj: state, name: "amplitude", label: "Amplitude", min: 0.1, max: 3.0, step: 0.1 },
        { type: "range", obj: state, name: "frequency", label: "Frequency", min: 0.1, max: 3.0, step: 0.1 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* () {
        const dispatchX = Math.ceil(NUM_VERTICES / 64);

        // 1. Initialization Compute Pass
        state.initialize = 1.0;
        writeUniformObject('Params', state);
        compute('wave_compute', dispatchX);

        yield 'frame';

        // 2. Main execution loop
        state.initialize = 0.0;

        // 2. Main execution loop
        while (true) {
            state.time += 0.016 * state.speed; 

            // Write uniform parameters
            writeUniformObject('Params', state);
            
            // Calculate wave heights and analytical normals
            compute('wave_compute', dispatchX);
            
            // Render the 240,000 vertices as 1 contiguous mesh instance
            render('wave_render', NUM_VERTICES, 1, true);
            
            yield 'frame';
        }
    }
};

export default schema;