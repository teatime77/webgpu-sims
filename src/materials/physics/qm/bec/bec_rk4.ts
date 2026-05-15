// src/materials/physics/qm/bec/bec_rk4.ts
import { compute, render, swap, writeStorage, writeUniformObject, type SimulationSchema } from '../../../../core/SimulationRunner';

const GW = 192;
const dispatchXY = GW / 8;

const state = {
    gridWidth: GW,
    gridHeight: GW,
    temperature: 2.3,
    dt: 0.001,
    g: 14.0,
    omega: 0.48,
    particleNumber: 2.5,
    domainHalf: 7.0,
    time: 0,
    partialNormCount: dispatchXY * dispatchXY,
    pad1: 0,
    pad2: 0,
};

const schema: SimulationSchema = {
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
            workgroupSize: [8, 8, 1],
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'psiOut', access: 'read_write' },
                { group: 0, binding: 2, resource: 'RngState', varName: 'rng', access: 'read_write' }
            ]
        },
        {
            id: 'bec_norm_partial', type: 'compute',
            workgroupSize: [8, 8, 1],
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
            workgroupSize: [8, 8, 1],
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 0, varName: 'psiN', access: 'read_write' },
                { group: 0, binding: 2, resource: 'NormScalar', access: 'read' }
            ]
        },
        
        // --- RK4 Pass ---
        {
            id: 'bec_rk4_k1', type: 'compute',
            workgroupSize: [8, 8, 1],
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K1', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_k2', type: 'compute',
            workgroupSize: [8, 8, 1],
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K1', access: 'read' },
                { group: 0, binding: 3, resource: 'K2', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_k3', type: 'compute',
            workgroupSize: [8, 8, 1],
            bindings: [
                { group: 0, binding: 0, resource: 'BecParams', varName: 'params' },
                { group: 0, binding: 1, resource: 'Psi', historyLevel: 1, varName: 'psi0', access: 'read' },
                { group: 0, binding: 2, resource: 'K2', access: 'read' },
                { group: 0, binding: 3, resource: 'K3', access: 'read_write' }
            ]
        },
        {
            id: 'bec_rk4_finish', type: 'compute',
            workgroupSize: [8, 8, 1],
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
    ]
    ,
    uis:[
        { type: "range", obj:state, name:"temperature", label: "Temperature", min: 0.0, max: 3.0, step: 0.01 },
        { type: "range", obj:state, name:"g", label: "Interaction (g)", min: 0.0, max: 80.0, step: 0.5 },
        { type: "range", obj:state, name:"omega", label:"Trap ω", min: 0.15, max: 1.2, step: 0.01 },
        { type: "range", obj:state, name:"particleNumber", label: "Norm ∫|ψ|²", min: 0.5, max: 8.0, step: 0.05 },

    ]
    ,
    // ========================================================================
    // 4. Script: Execute RK4 sequence
    // ========================================================================
    script: function* () {
        const rng = new Uint32Array(GW * GW).map(() => Math.random() * 0xFFFFFFFF);
        writeStorage('RngState', rng);

        let time = 0.0;

        state.time = time;
        writeUniformObject('BecParams', state);
        
        compute('bec_init', dispatchXY, dispatchXY);
        compute('bec_norm_partial', dispatchXY, dispatchXY);
        compute('bec_norm_total', 1);
        compute('bec_norm_apply', dispatchXY, dispatchXY);
        
        swap('Psi');
        yield 'frame';

        while (true) {
            time += state.dt;
            state.time = time;
            writeUniformObject('BecParams', state);

            // Execute the 4 steps of RK4 in sequence
            compute('bec_rk4_k1', dispatchXY, dispatchXY);
            render('bec_debug_k1', 6, 1, false, 'canvas-k1');

            compute('bec_rk4_k2', dispatchXY, dispatchXY);
            render('bec_debug_k2', 6, 1, false, 'canvas-k2');

            compute('bec_rk4_k3', dispatchXY, dispatchXY);
            render('bec_debug_k3', 6, 1, false, 'canvas-k3');

            compute('bec_rk4_finish', dispatchXY, dispatchXY);
            render('bec_debug_prenorm', 6, 1, false, 'canvas-prenorm');

            // Normalization
            compute('bec_norm_partial', dispatchXY, dispatchXY);
            compute('bec_norm_total', 1);
            compute('bec_norm_apply', dispatchXY, dispatchXY);
            
            // Rendering
            render('bec_render', 6, 1, false);
            render('bec_debug_render', 6, 1, false, 'debug-canvas');

            swap('Psi');
            yield 'frame';
        }
    }
};

export default schema;