// src/materials/test/ParticleSim.ts
import { makeGeodesicPolyhedron } from '../../../core/primitive';
import type { SimulationSchema } from '../../../core/engine/SimulationRunner';

const schema: SimulationSchema = {
    name: "Particle Physics V1.5",
    
    // ========================================================================
    // 1. Resource declarations (Fully V1 compatible)
    // ========================================================================
    resources: {
        Camera: { 
            type: 'uniform', 
            fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } 
        },
        Params: { 
            type: 'uniform', 
            fields: { speedScale: 'f32', colorR: 'f32', colorG: 'f32', colorB: 'f32', init: 'f32' } 
        },
        ParticleData: { 
            type: 'storage', format: 'vec4<f32>', count: 20000
        },
        BaseMesh: { 
            type: 'storage', format: 'f32', count: 3840 * 6 
        }
    },

    // ========================================================================
    // 2. Node declarations (Fully V1 compatible)
    // This allows the Node.js generator to create a perfect WGSL skeleton
    // ========================================================================
    nodes: [
        {
            id: 'particle_compute',
            type: 'compute',
            workgroupSize: 64,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'ParticleData', varName: 'particles', access: 'read_write' }
            ]
        },
        {
            id: 'particle_render',
            type: 'render',
            topology: 'triangle-list',
            depthTest: true,
            bindings: [
                { resource: 'Camera', varName: 'camera' },
                { resource: 'ParticleData', varName: 'particles', access: 'read' },
                { resource: 'BaseMesh', varName: 'baseMesh', access: 'read' },
                { resource: 'Params', varName: 'params' }
            ]
        }
    ]
    ,
    // ========================================================================
    // 4. Execution control via TS generator (Abolished V1's black-box DSL!)
    // ========================================================================
    script: function* (engine) {
        engine.writeUniformArray('Params', [1.0, 1.0, 0.7, 0.2, 1.0]);
        engine.compute('particle_compute', Math.ceil(20000 / 64));

        yield 'frame';

        engine.writeStorage('BaseMesh', makeGeodesicPolyhedron(0.02, 1));
        engine.writeUniformArray('Params', [1.0, 1.0, 0.7, 0.2, 0.0]);

        // Standard TypeScript loop, immediately understandable by both AI and humans
        while (true) {
            engine.compute('particle_compute', Math.ceil(20000 / 64));
            engine.render('particle_render', 3840, 10000, true);
            
            yield 'frame';
        }
    }
};

export default schema;