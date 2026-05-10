// src/materials/physics/qm/bec/bec_rk4.ts
import { SimUI } from '../../../../core/ui/SimUI';

const GW = 192;
const state = {
    temperature: 2.3,
    dt: 0.001,
    g: 14.0,
    omega: 0.48,
    particleNumber: 2.5
};

let runnerRef: any = null;

export default {
    name: "2D BEC Phase Transition V1.5 (RK4)",
    
    // ========================================================================
    // 1. Resources: RK4用の中間バッファ K1, K2, K3 を追加
    // ========================================================================
    resources: {
        BecParams: { 
            type: 'uniform', 
            fields: { 
                gridWidth: 'f32', gridHeight: 'f32', 
                temperature: 'f32', dt: 'f32', g: 'f32', 
                omega: 'f32', particleNumber: 'f32', 
                domainHalf: 'f32', time: 'f32', partialNormCount: 'f32',
                pad1: 'f32', pad2: 'f32' 
            } 
        },
        Psi: { type: 'storage', format: 'vec2<f32>', count: GW * GW, bufferCount: 2 },
        
        // RK4用の勾配バッファ (K4は最終パスで直接計算して適用するためメモリ確保不要)
        K1: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        K2: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        K3: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        
        PartialNorm: { type: 'storage', format: 'f32', count: (GW / 8) * (GW / 8) },
        NormScalar: { type: 'storage', format: 'f32', count: 4 },
        RngState: { type: 'storage', format: 'u32', count: GW * GW },
        DebugData: { type: 'storage', format: 'vec4<f32>', count: GW * GW }
    },

    // ========================================================================
    // 2. Nodes: RK4の4つのステップをノードとして定義
    // ========================================================================
    nodes: [
        {
            id: 'bec_init', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'psiOut', access: 'read_write' },
                { group: 0, binding: 2, resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'bec_norm_partial', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'psiR', access: 'read' },
                { group: 0, binding: 2, resource: 'PartialNorm', access: 'read_write' }
            ]
        },
        {
            id: 'bec_norm_total', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'PartialNorm', access: 'read' },
                { group: 0, binding: 2, resource: 'NormScalar', access: 'read_write' }
            ]
        },
        {
            id: 'bec_norm_apply', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'psiN', access: 'read_write' },
                { group: 0, binding: 2, resource: 'NormScalar', access: 'read' }
            ]
        },
        
        // --- RK4 パス ---
        {
            id: 'bec_rk4_k1', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K1', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_k2', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K1', access: 'read' },
                { group: 0, binding: 3, resource: 'K2', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_k3', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K2', access: 'read' },
                { group: 0, binding: 3, resource: 'K3', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_finish', type: 'compute',
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K1', access: 'read' },
                { group: 0, binding: 3, resource: 'K2', access: 'read' },
                { group: 0, binding: 4, resource: 'K3', access: 'read' },
                { group: 0, binding: 5, resource: 'Psi', historyLevel: 0, varName: 'psiOut', access: 'read_write' },
                { group: 0, binding: 6, resource: 'RngState', varName: 'rng', access: 'read_write' },
                { group: 0, binding: 7, resource: 'DebugData', varName: 'debug', access: 'read_write' }
            ]
        },
        // ----------------

        {
            id: 'bec_render', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'Psi', access: 'read' }
            ]
        },
        {
            id: 'bec_debug_render', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'DebugData', varName: 'debug', access: 'read' }
            ]
        }
        ,
        {
            id: 'bec_debug_k1', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'K1', varName: 'data', access: 'read' }
            ]
        },
        {
            id: 'bec_debug_k2', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'K2', varName: 'data', access: 'read' }
            ]
        },
        {
            id: 'bec_debug_k3', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'K3', varName: 'data', access: 'read' }
            ]
        },
        {
            id: 'bec_debug_prenorm', type: 'render', topology: 'triangle-list', depthTest: false,
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'data', access: 'read' }
            ]
        }        
    ],

    // ========================================================================
    // 3. Init
    // ========================================================================
    init: async (runner: any) => {
        runnerRef = runner;
        const rng = new Uint32Array(GW * GW).map(() => Math.random() * 0xFFFFFFFF);
        runner.writeStorage('RngState', rng);

        const ui = new SimUI();
        ui.addRange("Temperature", 0.0, 3.0, 0.01, state.temperature, v => state.temperature = v);
        ui.addRange("Interaction (g)", 0.0, 80.0, 0.5, state.g, v => state.g = v);
        ui.addRange("Trap ω", 0.15, 1.2, 0.01, state.omega, v => state.omega = v);
        ui.addRange("Norm ∫|ψ|²", 0.5, 8.0, 0.05, state.particleNumber, v => state.particleNumber = v);
    },

    // ========================================================================
    // 4. Script: RK4のシーケンスを実行
    // ========================================================================
    script: function* ({ call, swap }: any) {
        const dispatchXY = GW / 8;
        let time = 0.0;

        const updateParams = () => {
            const buf = runnerRef.getUniformBuffer('BecParams');
            const paramData = new Float32Array([
                GW, GW, state.temperature, state.dt,
                state.g, state.omega, state.particleNumber, 7.0, // domainHalfは元の7.0のままでOK
                time, dispatchXY * dispatchXY,
                0.0, 0.0
            ]);
            runnerRef.device.queue.writeBuffer(buf, 0, paramData);
        };

        updateParams();
        
        yield { type: 'compute', builder: call('bec_init'), x: dispatchXY, y: dispatchXY };
        yield { type: 'compute', builder: call('bec_norm_partial'), x: dispatchXY, y: dispatchXY };
        yield { type: 'compute', builder: call('bec_norm_total'), x: 1 };
        yield { type: 'compute', builder: call('bec_norm_apply'), x: dispatchXY, y: dispatchXY };
        
        swap('Psi');
        yield 'frame';

        while (true) {
            time += state.dt;
            updateParams();            

            // RK4の4ステップを順番に実行
            yield { type: 'compute', builder: call('bec_rk4_k1'), x: dispatchXY, y: dispatchXY };
            yield { type: 'render', builder: call('bec_debug_k1'), vertexCount: 6, instanceCount: 1, hasDepth: false, canvas: 'canvas-k1' };

            yield { type: 'compute', builder: call('bec_rk4_k2'), x: dispatchXY, y: dispatchXY };
            yield { type: 'render', builder: call('bec_debug_k2'), vertexCount: 6, instanceCount: 1, hasDepth: false, canvas: 'canvas-k2' };

            yield { type: 'compute', builder: call('bec_rk4_k3'), x: dispatchXY, y: dispatchXY };
            yield { type: 'render', builder: call('bec_debug_k3'), vertexCount: 6, instanceCount: 1, hasDepth: false, canvas: 'canvas-k3' };

            yield { type: 'compute', builder: call('bec_rk4_finish'), x: dispatchXY, y: dispatchXY };
            yield { type: 'render', builder: call('bec_debug_prenorm'), vertexCount: 6, instanceCount: 1, hasDepth: false, canvas: 'canvas-prenorm' };

            // 規格化
            yield { type: 'compute', builder: call('bec_norm_partial'), x: dispatchXY, y: dispatchXY };
            yield { type: 'compute', builder: call('bec_norm_total'), x: 1 };
            yield { type: 'compute', builder: call('bec_norm_apply'), x: dispatchXY, y: dispatchXY };
            
            // 描画
            yield { type: 'render', builder: call('bec_render'), vertexCount: 6, instanceCount: 1, hasDepth: false };
            yield { 
                type: 'render', builder: call('bec_debug_render'), 
                vertexCount: 6, instanceCount: 1, hasDepth: false, 
                canvas: 'debug-canvas' 
            };

            swap('Psi');
            yield 'frame';
        }
    }
};