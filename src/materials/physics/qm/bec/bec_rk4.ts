// src/materials/physics/qm/bec/bec_rk4.ts
import { SimUI } from '../../../../core/ui/SimUI';
import { defineSimulation } from '../../../../core/engine/SimulationRunner';

const GW = 192;
const state = {
    temperature: 2.3,
    dt: 0.001,
    g: 14.0,
    omega: 0.48,
    particleNumber: 2.5
};

export default defineSimulation({
    name: "2D BEC Phase Transition V1.5 (RK4)",
    
    // ========================================================================
    // 1. Resources: Add intermediate buffers K1, K2, K3 for RK4
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
        
        // Gradient buffers for RK4 (K4 is calculated and applied directly in the final pass, so no memory allocation is needed)
        K1: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        K2: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        K3: { type: 'storage', format: 'vec2<f32>', count: GW * GW },
        
        PartialNorm: { type: 'storage', format: 'f32', count: (GW / 8) * (GW / 8) },
        NormScalar: { type: 'storage', format: 'f32', count: 4 },
        RngState: { type: 'storage', format: 'u32', count: GW * GW },
        DebugData: { type: 'storage', format: 'vec4<f32>', count: GW * GW }
    },

    // ========================================================================
    // 2. Nodes: Define the 4 steps of RK4 as nodes
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
        
        // --- RK4 Pass ---
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
    init: async (runner) => {
        const rng = new Uint32Array(GW * GW).map(() => Math.random() * 0xFFFFFFFF);
        runner.writeStorage('RngState', rng);

        const ui = new SimUI();
        ui.addRange("Temperature", 0.0, 3.0, 0.01, state.temperature, v => state.temperature = v);
        ui.addRange("Interaction (g)", 0.0, 80.0, 0.5, state.g, v => state.g = v);
        ui.addRange("Trap ω", 0.15, 1.2, 0.01, state.omega, v => state.omega = v);
        ui.addRange("Norm ∫|ψ|²", 0.5, 8.0, 0.05, state.particleNumber, v => state.particleNumber = v);
    },

    // ========================================================================
    // 4. Script: Execute RK4 sequence
    // ========================================================================
    script: function* (runner) {
        const dispatchXY = GW / 8;
        let time = 0.0;

        const updateParams = () => {
            const buf = runner.getUniformBuffer('BecParams');
            const paramData = new Float32Array([
                GW, GW, state.temperature, state.dt,
                state.g, state.omega, state.particleNumber, 7.0, // domainHalf remains 7.0 as original
                time, dispatchXY * dispatchXY,
                0.0, 0.0
            ]);
            runner.device.queue.writeBuffer(buf, 0, paramData);
        };

        updateParams();
        
        runner.compute('bec_init', dispatchXY, dispatchXY);
        runner.compute('bec_norm_partial', dispatchXY, dispatchXY);
        runner.compute('bec_norm_total', 1);
        runner.compute('bec_norm_apply', dispatchXY, dispatchXY);
        
        runner.swap('Psi');
        yield 'frame';

        while (true) {
            time += state.dt;
            updateParams();            

            // Execute the 4 steps of RK4 in sequence
            runner.compute('bec_rk4_k1', dispatchXY, dispatchXY);
            runner.render('bec_debug_k1', 6, 1, false, 'canvas-k1');

            runner.compute('bec_rk4_k2', dispatchXY, dispatchXY);
            runner.render('bec_debug_k2', 6, 1, false, 'canvas-k2');

            runner.compute('bec_rk4_k3', dispatchXY, dispatchXY);
            runner.render('bec_debug_k3', 6, 1, false, 'canvas-k3');

            runner.compute('bec_rk4_finish', dispatchXY, dispatchXY);
            runner.render('bec_debug_prenorm', 6, 1, false, 'canvas-prenorm');

            // Normalization
            runner.compute('bec_norm_partial', dispatchXY, dispatchXY);
            runner.compute('bec_norm_total', 1);
            runner.compute('bec_norm_apply', dispatchXY, dispatchXY);
            
            // Rendering
            runner.render('bec_render', 6, 1, false);
            runner.render('bec_debug_render', 6, 1, false, 'debug-canvas');

            runner.swap('Psi');
            yield 'frame';
        }
    }
});