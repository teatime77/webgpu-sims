// src/materials/test/vector_field/vector_field.ts
import type { SimulationSchema } from '../../../core/engine/SimulationRunner';
import { makeArrowMesh } from '../../../core/primitive';

// UI State
const state = {
    time: 0.0,
    speed: 1.0,
    fieldScale: 1.0,      // Increased default visual scale
    gridSpacing: 1.0      // Increased distance between grid points
};

// 10x10x10 grid = 1,000 arrows (Much cleaner than 4096)
const GRID_SIZE = 10;
const NUM_ARROWS = GRID_SIZE * GRID_SIZE * GRID_SIZE;

// Arrow mesh constants
const RADIAL_SEGMENTS = 8;
const ARROW_VERTICES = RADIAL_SEGMENTS * 12;

const schema: SimulationSchema = {
    name: "Dynamic Vector Field",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                time: 'f32', 
                fieldScale: 'f32', 
                pad1: 'f32', 
                pad2: 'f32' 
            } 
        },
        GridPositions: { type: 'storage', format: 'vec4<f32>', count: NUM_ARROWS },
        GridVectors: { type: 'storage', format: 'vec4<f32>', count: NUM_ARROWS },
        ArrowMesh: { type: 'storage', format: 'f32', count: ARROW_VERTICES * 6 }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'field_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'GridPositions', varName: 'positions', access: 'read' },
                { resource: 'GridVectors', varName: 'vectors', access: 'read_write' }
            ]
        },
        {
            id: 'field_render',
            type: 'render',
            topology: 'triangle-list',
            blendMode: 'opaque',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'GridPositions', varName: 'positions', access: 'read' },
                { resource: 'GridVectors', varName: 'vectors', access: 'read' },
                { resource: 'ArrowMesh', varName: 'arrowMesh', access: 'read' },
                { resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. UI Controls
    // ========================================================
    uis:[
        { type: "range", obj: state, name: "speed", label: "Evolution Speed", min: 0.0, max: 5.0, step: 0.1 },
        { type: "range", obj: state, name: "fieldScale", label: "Arrow Scale", min: 0.1, max: 3.0, step: 0.1 }
    ],

    // ========================================================
    // 4. Execution Loop
    // ========================================================
    script: function* (runner) {
        const dispatchX = Math.ceil(NUM_ARROWS / 64);

        // 1. Initialize the 3D Grid Positions
        const posData = new Float32Array(NUM_ARROWS * 4);
        let idx = 0;
        
        const offset = (GRID_SIZE - 1) * state.gridSpacing / 2;

        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                for (let z = 0; z < GRID_SIZE; z++) {
                    posData[idx++] = (x * state.gridSpacing) - offset;
                    posData[idx++] = (y * state.gridSpacing) - offset;
                    posData[idx++] = (z * state.gridSpacing) - offset;
                    posData[idx++] = 1.0; 
                }
            }
        }
        
        runner.writeStorage('GridPositions', posData);

        // 2. Load the Arrow Mesh with Custom Scaling
        // By scaling X and Z by 4.0, we make the arrow shaft and head much thicker
        // while leaving the length (Y) at 1.0 to be scaled dynamically by the shader.
        const arrowGeom = makeArrowMesh({ 
            numDivision: RADIAL_SEGMENTS,
            scale: [4.0, 1.0, 4.0] 
        });
        runner.writeStorage('ArrowMesh', arrowGeom);

        // 3. Main execution loop
        while (true) {
            state.time += 0.016 * state.speed; 

            const paramData = new Float32Array([
                state.time, state.fieldScale, 0.0, 0.0
            ]);
            runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, paramData);
            
            runner.compute('field_compute', dispatchX);
            runner.render('field_render', ARROW_VERTICES, NUM_ARROWS, true);
            
            yield 'frame';
        }
    }
};

export default schema;