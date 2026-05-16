// src/materials/physics/md/simple_md/simple_md.ts
import { compute, render, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';
import { makeGeodesicPolyhedron } from '../../../../core/primitive'; // Assuming this path based on your example

const state = {
    dt: 0.005,
    gravity: 9.8,
    interactionRadius: 0.2,
    stiffness: 500.0,
    boxSize: 10.0,
    time:0.0,
};

const NUM_PARTICLES = 4096;
const dispatchX = Math.ceil(NUM_PARTICLES / 64);

const VERTEX_COUNT = 3840; // Vertex count for detail=1 geodesic polyhedron

const schema: SimulationSchema = {
    name: "Simple Molecular Dynamics 3D",

    // ========================================================
    // 1. Resource definition
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            obj : state
        },
        ParticlePos: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        ParticleVel: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        // ★ Added: Buffer to hold the geometry of a single sphere
        BaseMesh: { type: 'storage', format: 'f32', count: VERTEX_COUNT * 6 } 
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    nodes: [
        {
            id: 'md_compute',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { group: 0, binding: 0, resource: 'Params', varName: 'params' },
                { group: 0, binding: 1, resource: 'ParticlePos', varName: 'positions', access: 'read_write' },
                { group: 0, binding: 2, resource: 'ParticleVel', varName: 'velocities', access: 'read_write' }
            ]
        },
        {
            id: 'md_render',
            type: 'render',
            topology: 'triangle-list', // ★ Changed from point-list
            blendMode: 'add',
            depthTest: true,
            bindings: [
                { group: 0, binding: 0, resource: 'Camera', varName: 'camera' },
                { group: 0, binding: 1, resource: 'ParticlePos', varName: 'positions', access: 'read' },
                { group: 0, binding: 2, resource: 'ParticleVel', varName: 'velocities', access: 'read' },
                { group: 0, binding: 3, resource: 'BaseMesh', varName: 'baseMesh', access: 'read' }, // ★ Added
                { group: 0, binding: 4, resource: 'Params', varName: 'params' } // ★ Brought back for radius scaling
            ]
        }
    ],

    uis:[
        { type: "range", obj: state, name: "dt", label: "Time Step", min: 0.001, max: 0.02, step: 0.001 },
        { type: "range", obj: state, name: "gravity", label: "Gravity", min: 0.0, max: 20.0, step: 0.1 },
        { type: "range", obj: state, name: "interactionRadius", label: "Particle Radius", min: 0.05, max: 0.5, step: 0.01 },
        { type: "range", obj: state, name: "stiffness", label: "Repulsion Stiffness", min: 100.0, max: 1000.0, step: 10.0 }
    ],

    script: function* () {

        // ★ Added: Generate a unit sphere (radius 1.0) to be scaled in the shader
        writeStorage('BaseMesh', makeGeodesicPolyhedron(1));

        while (true) {
            writeUniformObject('Params', state);
            
            compute('md_compute');
            
            // ★ Changed: vertexCount = VERTEX_COUNT, instanceCount = NUM_PARTICLES
            render('md_render', VERTEX_COUNT, NUM_PARTICLES, true);
            
            yield 'frame';
        }
    }
};

export default schema;