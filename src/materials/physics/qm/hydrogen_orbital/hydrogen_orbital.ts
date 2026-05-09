// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts
import { SimUI } from '../../../../core/ui/SimUI';

// シミュレーションの状態を保持するオブジェクト
const state = {
    orbitalMode: 0.0,    // ★ 1.0 (2p) から 0.0 (1s) に変更
    samplingStep: 0.15,
    brightness: 0.05,
    colorMix: 0.5,
    needsReset: true     // ★ false から true に変更（ロード直後にバーンインさせる）
};

let runnerRef: any = null;
const NUM_PARTICLES = 1000000;

export default {
    name: "Hydrogen Orbital V1.5",

    // ========================================================
    // 1. リソース定義 (パディング計算不要！)
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { orbitalMode: 'f32', samplingStep: 'f32', brightness: 'f32', colorMix: 'f32', resetFlag: 'f32' } 
        },
        ParticleData: { type: 'storage', format: 'vec4<f32>', count: NUM_PARTICLES },
        RngState: { type: 'storage', format: 'u32', count: NUM_PARTICLES }
    },

    // ========================================================
    // 2. ノード（パス）定義
    // ========================================================
    nodes: [
        {
            id: 'hydrogen_orbital_comp',
            type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'Params', varName: 'params' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read_write' },
                { group: 0, binding: 2, resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'hydrogen_orbital_render',
            type: 'render',
            topology: 'point-list',
            blendMode: 'add',
            depthTest: false, // 点描画(加算合成)のためデプス不要
            bindings: [
                { group: 0, binding: 0, resource: 'Camera', varName: 'camera' },
                { group: 0, binding: 1, resource: 'ParticleData', varName: 'particles', access: 'read' },
                { group: 0, binding: 3, resource: 'Params', varName: 'params' }
            ]
        }
    ],

    // ========================================================
    // 3. 初期化ロジック (UIと乱数シード)
    // ========================================================
    init: async (runner: any) => {
        runnerRef = runner; // スクリプトから参照するために保持

        // 乱数状態バッファの初期化
        const rngState = new Uint32Array(NUM_PARTICLES);
        for (let i = 0; i < NUM_PARTICLES; i++) {
            rngState[i] = Math.random() * 0xFFFFFFFF;
        }
        runner.writeStorage('RngState', rngState);

        // UIパネルの構築
        const ui = new SimUI();
        ui.addSelect("Orbital", [
            { value: 0, text: "1s (spherical)" },
            { value: 1, text: "2p_z (dumbbell)" },
            { value: 2, text: "3d_z2 (donut+lobes)" }
        ], state.orbitalMode, v => {
            state.orbitalMode = v;
            state.needsReset = true; // 切り替え時にバーンインを要求
        });
        ui.addRange("Sampling Step", 0.01, 1.0, 0.01, state.samplingStep, v => state.samplingStep = v);
        ui.addRange("Brightness", 0.001, 0.2, 0.001, state.brightness, v => state.brightness = v);
        ui.addRange("Color Mix", 0.0, 1.0, 0.01, state.colorMix, v => state.colorMix = v);
    },

    // ========================================================
    // 4. 実行ジェネレータ (MCMCバーンインのオーケストレーション)
    // ========================================================
    script: function* ({ call }: any) {
        const dispatchX = Math.ceil(NUM_PARTICLES / 64);

        while (true) {
            let currentResetFlag = 0.0;
            if (state.needsReset) currentResetFlag = 1.0;

            // UIの最新値をGPUへ転送
            runnerRef.updateVariables('Params', {
                orbitalMode: state.orbitalMode,
                samplingStep: state.samplingStep,
                brightness: state.brightness,
                colorMix: state.colorMix,
                resetFlag: currentResetFlag
            });

            if (state.needsReset) {
                // 1. 全パーティクルをランダム再配置 (resetFlag = 1.0)
                yield { type: 'compute', builder: call('hydrogen_orbital_comp'), x: dispatchX };
                
                // 2. フラグを0に戻す
                runnerRef.updateVariables('Params', { resetFlag: 0.0 });
                
                // 3. 高速バーンイン (1フレーム内で16回計算を回して即座に収束させる)
                for (let i = 0; i < 16; i++) {
                    yield { type: 'compute', builder: call('hydrogen_orbital_comp'), x: dispatchX };
                }
                state.needsReset = false;
            } else {
                // 通常サンプリング
                yield { type: 'compute', builder: call('hydrogen_orbital_comp'), x: dispatchX };
            }

            // 描画 (point-listなので頂点数はNUM_PARTICLES)
            yield { 
                type: 'render', 
                builder: call('hydrogen_orbital_render'), 
                vertexCount: NUM_PARTICLES, 
                instanceCount: 1,
                hasDepth: false 
            };
            
            yield 'frame';
        }
    }
};