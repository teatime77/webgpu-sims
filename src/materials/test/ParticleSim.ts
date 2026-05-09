// src/materials/test/ParticleSim.ts
import { makeGeodesicPolyhedron } from '../../core/primitive';

export default {
    name: "Particle Physics V1.5",
    
    // ========================================================================
    // 1. リソースの宣言 (V1完全互換)
    // ========================================================================
    resources: {
        Camera: { 
            type: 'uniform', 
            fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } 
        },
        Params: { 
            type: 'uniform', 
            fields: { speedScale: 'f32', colorR: 'f32', colorG: 'f32', colorB: 'f32' } 
        },
        ParticleData: { 
            type: 'storage', format: 'vec4<f32>', count: 20000
        },
        BaseMesh: { 
            type: 'storage', format: 'f32', count: 3840 * 6 
        }
    },

    // ========================================================================
    // 2. ノードの宣言 (V1完全互換)
    // これがあるおかげで、Node.jsジェネレータが完璧なWGSLスケルトンを作れます
    // ========================================================================
    nodes: [
        {
            id: 'particle_compute',
            type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'Params', varName: 'params' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read_write' }
            ]
        },
        {
            id: 'particle_render',
            type: 'render',
            topology: 'triangle-list',
            depthTest: true,
            bindings: [
                { group: 0, binding: 0, resource: 'Camera', varName: 'camera' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read' },
                { group: 0, binding: 2, resource: 'BaseMesh', varName: 'baseMesh', access: 'read' },
                { group: 0, binding: 3, resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================================
    // 3. TSによる初期化ロジック (V2の柔軟性を吸収)
    // ========================================================================
    init: async (engine: any) => {
        engine.updateVariables('Params', {
            speedScale: 1.0, colorR: 1.0, colorG: 0.7, colorB: 0.2
        });

        const numParticles = 20000 / 2;
        const initialData = new Float32Array(20000 * 4);
        for (let i = 0; i < numParticles; i++) {
            // 位置 (pos)
            initialData[i * 8 + 0] = (Math.random() - 0.5) * 2;
            initialData[i * 8 + 1] = (Math.random() - 0.5) * 2;
            initialData[i * 8 + 2] = (Math.random() - 0.5) * 2;

            // ★ 追加: 速度 (vel) の初期値を与える
            initialData[i * 8 + 4] = (Math.random() - 0.5) * 0.02;
            initialData[i * 8 + 5] = (Math.random() - 0.5) * 0.02;
            initialData[i * 8 + 6] = (Math.random() - 0.5) * 0.02;
        }
        engine.writeStorage('ParticleData', initialData);

        engine.writeStorage('BaseMesh', makeGeodesicPolyhedron(0.02, 1));
    },

    // ========================================================================
    // 4. TSジェネレータによる実行制御 (V1のブラックボックスDSLを撤廃！)
    // ========================================================================
    script: function* ({ call, swap }: any) {
        // AIも人間も一目で分かる、標準的なTypeScriptのループ
        while (true) {
            yield call('particle_compute');
            yield call('particle_render');
            
            yield 'frame'; // 1フレーム終了の合図
        }
    }
};