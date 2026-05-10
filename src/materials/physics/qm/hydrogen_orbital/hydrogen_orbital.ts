// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts
import { SimUI } from '../../../../core/ui/SimUI';
import { defineSimulation } from '../../../../core/engine/SimulationRunner';

// シミュレーションの状態を保持するオブジェクト
const state = {
    orbitalMode: 0.0,    // ★ 1.0 (2p) から 0.0 (1s) に変更
    samplingStep: 0.15,
    brightness: 0.05,
    colorMix: 0.5,
    needsReset: true     // ★ false から true に変更（ロード直後にバーンインさせる）
};

const NUM_PARTICLES = 1000000;

export default defineSimulation({
    name: "Hydrogen Orbital V1.5",

    // ========================================================
    // 1. リソース定義 (パディング計算不要！)
    // ========================================================
    resources: {
        Camera: { type: 'uniform', fields: { viewProjection: 'mat4x4<f32>', view: 'mat4x4<f32>' } },
        Params: { 
            type: 'uniform', 
            fields: { 
                orbitalMode: 'f32', samplingStep: 'f32', brightness: 'f32', colorMix: 'f32', 
                resetFlag: 'f32', pad1: 'f32', pad2: 'f32', pad3: 'f32' 
            } 
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
    init: async (runner) => {
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
    script: function* (runner) {
        const dispatchX = Math.ceil(NUM_PARTICLES / 64);

        while (true) {
            let currentResetFlag = 0.0;
            if (state.needsReset) currentResetFlag = 1.0;

            // UIの最新値をGPUへ転送
            const paramData = new Float32Array([
                state.orbitalMode, state.samplingStep, state.brightness, state.colorMix,
                currentResetFlag, 0.0, 0.0, 0.0
            ]);
            runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, paramData);

            if (state.needsReset) {
                // 1. 全パーティクルをランダム再配置 (resetFlag = 1.0)
                runner.compute('hydrogen_orbital_comp', dispatchX);
                
                // 2. フラグを0に戻す
                const resetParamData = new Float32Array([
                    state.orbitalMode, state.samplingStep, state.brightness, state.colorMix,
                    0.0, 0.0, 0.0, 0.0
                ]);
                runner.device.queue.writeBuffer(runner.getUniformBuffer('Params'), 0, resetParamData);
                
                // 3. 高速バーンイン (1フレーム内で16回計算を回して即座に収束させる)
                for (let i = 0; i < 16; i++) {
                    runner.compute('hydrogen_orbital_comp', dispatchX);
                }
                state.needsReset = false;
            } else {
                // 通常サンプリング
                runner.compute('hydrogen_orbital_comp', dispatchX);
            }

            // 描画 (point-listなので頂点数はNUM_PARTICLES)
            runner.render('hydrogen_orbital_render', NUM_PARTICLES, 1, false);
            
            yield 'frame';
        }
    }
});