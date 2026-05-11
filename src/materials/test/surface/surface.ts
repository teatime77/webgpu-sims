// src/materials/test/surface/surface.ts
import type { SimulationSchema } from '../../../core/engine/SimulationRunner';

// UI State
const state = {
    time: 0.0,
    speed: 1.0,
    amplitude: 1.0,
    frequency: 1.0
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
                time: 'f32', speed: 'f32', amplitude: 'f32', frequency: 'f32' 
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
                { resource: 'BaseGrid', varName: 'baseGrid', access: 'read' },
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
    script: function* (runner) {
        const dispatchX = Math.ceil(NUM_VERTICES / 64);

        // 1. Generate the static base grid on the XZ plane
        const baseGridData = new Float32Array(NUM_VERTICES * 4);
        let idx = 0;
        
        const size = 20.0;
        const halfSize = size / 2.0;
        const step = size / GRID_SIZE;

        for (let z = 0; z < GRID_SIZE; z++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const x0 = x * step - halfSize;
                const z0 = z * step - halfSize;
                const x1 = (x + 1) * step - halfSize;
                const z1 = (z + 1) * step - halfSize;

                // Triangle 1: Bottom-Left, Bottom-Right, Top-Left
                baseGridData[idx++] = x0; baseGridData[idx++] = 0.0; baseGridData[idx++] = z0; baseGridData[idx++] = 1.0;
                baseGridData[idx++] = x1; baseGridData[idx++] = 0.0; baseGridData[idx++] = z0; baseGridData[idx++] = 1.0;
                baseGridData[idx++] = x0; baseGridData[idx++] = 0.0; baseGridData[idx++] = z1; baseGridData[idx++] = 1.0;

                // Triangle 2: Bottom-Right, Top-Right, Top-Left
                baseGridData[idx++] = x1; baseGridData[idx++] = 0.0; baseGridData[idx++] = z0; baseGridData[idx++] = 1.0;
                baseGridData[idx++] = x1; baseGridData[idx++] = 0.0; baseGridData[idx++] = z1; baseGridData[idx++] = 1.0;
                baseGridData[idx++] = x0; baseGridData[idx++] = 0.0; baseGridData[idx++] = z1; baseGridData[idx++] = 1.0;
            }
        }
        
        runner.writeStorage('BaseGrid', baseGridData);

        // 2. Main execution loop
        while (true) {
            state.time += 0.016 * state.speed; 

            // Write uniform parameters
            const paramData = new Float32Array([
                state.time, state.speed, state.amplitude, state.frequency
            ]);
            runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, paramData);
            
            // Calculate wave heights and analytical normals
            runner.compute('wave_compute', dispatchX);
            
            // Render the 240,000 vertices as 1 contiguous mesh instance
            runner.render('wave_render', NUM_VERTICES, 1, true);
            
            yield 'frame';
        }
    }
};

export default schema;