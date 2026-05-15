// src/materials/test/vector_field/vector_field.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../core/SimulationRunner';
import { makeArrowMesh } from '../../../core/primitive';

// UI State
const state = {
    time: 0.0,
    fieldScale: 1.0,
    speed: 1.0,
    gridSpacing: 1.0,
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
            obj : state,
            fields: { 
                time: 'f32', 
                fieldScale: 'f32', 
                speed: 'f32', 
                gridSpacing: 'f32',
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
                { resource: 'GridPositions', varName: 'positions', access: 'read_write' },
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
    script: function* () {
        const dispatchX = Math.ceil(NUM_ARROWS / 64);

        // Load the Arrow Mesh
        const arrowGeom = makeArrowMesh({ 
            numDivision: RADIAL_SEGMENTS,
            scale: [4.0, 1.0, 4.0] 
        });
        writeStorage('ArrowMesh', arrowGeom);

        // 3. Main execution loop
        while (true) {
            writeUniformObject('Params', state);            
            compute('field_compute', dispatchX);
            render('field_render', ARROW_VERTICES, NUM_ARROWS, true);
            
            yield 'frame';
        }
    }
};

export default schema;