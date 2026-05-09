// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital.ts

import { WebGPUEngine } from '../../../../core/engine/WebGPUEngine';
import { ComputePassBuilder } from '../../../../core/builder/ComputePassBuilder';
import { RenderPassBuilder } from '../../../../core/builder/RenderPassBuilder';
import { SimUI } from '../../../../core/ui/SimUI';

import computeShader from './hydrogen_orbital_comp.wgsl?raw';
import renderShader from './hydrogen_orbital_render.wgsl?raw';

export class HydrogenOrbitalSim {
    private ui!: SimUI;
    private numParticles = 1000000;
    
    private computePass!: ComputePassBuilder;
    private renderPass!: RenderPassBuilder;

    private particleBuffer!: GPUBuffer;
    private rngStateBuffer!: GPUBuffer;
    private cameraBuffer!: GPUBuffer;
    private paramsBuffer!: GPUBuffer;

    public simParams = {
        orbitalMode: 1.0,
        samplingStep: 0.15,
        brightness: 0.05,
        colorMix: 0.5,
        resetFlag: 0.0,
    };

    async init(engine: WebGPUEngine) {
        const { device, format } = engine;

        this.particleBuffer = device.createBuffer({
            size: this.numParticles * 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        const rngState = new Uint32Array(this.numParticles).map(() => Math.random() * 0xFFFFFFFF);
        this.rngStateBuffer = device.createBuffer({
            size: rngState.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation: true
        });
        new Uint32Array(this.rngStateBuffer.getMappedRange()).set(rngState); this.rngStateBuffer.unmap();

        this.cameraBuffer = device.createBuffer({
            size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // ★ 修正: f32 が 8個分 = 32バイト
        this.paramsBuffer = device.createBuffer({
            size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.ui = new SimUI();
        this.ui.addSelect("Orbital", [
            { value: 0, text: "1s (spherical)" },
            { value: 1, text: "2p_z (dumbbell)" },
            { value: 2, text: "3d_z2 (donut+lobes)" }
        ], this.simParams.orbitalMode, v => {
            this.simParams.orbitalMode = v;
            this.simParams.resetFlag = 1.0; 
        });
        this.ui.addRange("Sampling Step", 0.01, 1.0, 0.01, this.simParams.samplingStep, v => this.simParams.samplingStep = v);
        this.ui.addRange("Brightness", 0.001, 0.2, 0.001, this.simParams.brightness, v => this.simParams.brightness = v);
        this.ui.addRange("Color Mix", 0.0, 1.0, 0.01, this.simParams.colorMix, v => this.simParams.colorMix = v);

        this.computePass = new ComputePassBuilder(device, computeShader, 'main_compute')
            .setGroup(0)
            .addUniform(this.paramsBuffer, 0)
            .addStorage(this.particleBuffer, 1)
            .addStorage(this.rngStateBuffer, 2);

        this.renderPass = new RenderPassBuilder(device, renderShader, format, { 
            topology: 'point-list',
            blendMode: 'add',
            depthFormat: undefined,
        })
            .setGroup(0)
            .addUniform(this.cameraBuffer, 0)
            .addStorage(this.particleBuffer, 1)
            .addUniform(this.paramsBuffer, 3);
    }

    // ★ 修正: オプショナル引数にしつつ、デフォルト値を設定
    update(engine: WebGPUEngine, matrices: { viewProjection: number[], view: number[] }, cameraDistance: number = 40.0) {
        const device = engine.device;

        this.ui.updateHUD(`Zoom (Dist): ${cameraDistance.toFixed(2)}`);

        device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array(matrices.viewProjection));
        device.queue.writeBuffer(this.cameraBuffer, 64, new Float32Array(matrices.view));
        
        // ★ 修正: WGSLの構造体と完全に一致する 8要素(32バイト) の配列を送信
        device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
            this.simParams.orbitalMode,
            this.simParams.samplingStep,
            this.simParams.brightness,
            this.simParams.colorMix,
            this.simParams.resetFlag,
            0.0, // pad1
            0.0, // pad2
            0.0  // pad3
        ]));

        const commandEncoder = device.createCommandEncoder();
        
        const cPass = commandEncoder.beginComputePass();
        if (this.simParams.resetFlag > 0.5) {
            this.computePass.dispatch(cPass, Math.ceil(this.numParticles / 64));
            this.simParams.resetFlag = 0.0;
            
            for(let i = 0; i < 16; i++) {
                this.computePass.dispatch(cPass, Math.ceil(this.numParticles / 64));
            }
        } else {
            this.computePass.dispatch(cPass, Math.ceil(this.numParticles / 64));
        }
        cPass.end();

        const rPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: engine.getContext('main-canvas').getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.005, a: 1.0 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });
        this.renderPass.draw(rPass, this.numParticles, 1);
        rPass.end();

        device.queue.submit([commandEncoder.finish()]);
    }
}