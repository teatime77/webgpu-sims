// src/materials/test/ParticleSim.ts
import { WebGPUEngine } from '../../core/engine/WebGPUEngine';
import { ComputePassBuilder } from '../../core/builder/ComputePassBuilder';
import { RenderPassBuilder } from '../../core/builder/RenderPassBuilder';
import { makeGeodesicPolyhedron } from '../../core/primitive';

// ★ ここでWGSLファイルを文字列としてインポートします
import computeShader from './particle_compute.wgsl?raw';
import renderShader from './particle_render.wgsl?raw';

export class ParticleSim {
    private numParticles = 100;
    private computePass!: ComputePassBuilder;
    private renderPass!: RenderPassBuilder;
    private sphereVertexCount = 0;

    private particleBuffer!: GPUBuffer;
    private baseMeshBuffer!: GPUBuffer;
    private cameraBuffer!: GPUBuffer;

    async init(engine: WebGPUEngine) {
        const { device, format } = engine;

        // 3. カメラ用ユニフォームバッファ (mat4x4が2つで128バイト)
        this.cameraBuffer = device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // 1. パーティクルデータの初期化
        const initialData = new Float32Array(this.numParticles * 8);
        for (let i = 0; i < this.numParticles; i++) {
            initialData[i * 8 + 0] = (Math.random() - 0.5) * 2;
            initialData[i * 8 + 1] = (Math.random() - 0.5) * 2;
            initialData[i * 8 + 2] = (Math.random() - 0.5) * 2;
            initialData[i * 8 + 4] = (Math.random() - 0.5) * 0.1;
            initialData[i * 8 + 5] = (Math.random() - 0.5) * 0.1;
            initialData[i * 8 + 6] = (Math.random() - 0.5) * 0.1;
        }
        this.particleBuffer = device.createBuffer({
            size: initialData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.particleBuffer.getMappedRange()).set(initialData);
        this.particleBuffer.unmap();

        // 2. 球体メッシュの生成
        const sphereData = makeGeodesicPolyhedron(0.02, 1);
        this.sphereVertexCount = sphereData.length / 6;
        this.baseMeshBuffer = device.createBuffer({
            size: sphereData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.baseMeshBuffer.getMappedRange()).set(sphereData);
        this.baseMeshBuffer.unmap();

        // ★ 修正: カメラ用バッファを 128バイト (64x2) で確保
        this.cameraBuffer = device.createBuffer({
            size: 128, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // 4. Builderの構築
        this.computePass = new ComputePassBuilder(device, computeShader, 'main_compute')
         .setGroup(0)
         .addStorage(this.particleBuffer, 1); // Computeはカメラを使わない

         this.renderPass = new RenderPassBuilder(device, renderShader, format, { depthFormat: 'depth24plus' })
         .setGroup(0)
         .addUniform(this.cameraBuffer, 0) // ★ ここでカメラバッファを0番に登録
         .addStorage(this.particleBuffer, 1)
         .addStorage(this.baseMeshBuffer, 2);
    }

    update(engine: WebGPUEngine, matrices: { viewProjection: number[], view: number[] }) {
        const device = engine.device;

        // ★ 重要: 書き込み先が this.cameraBuffer になっているか確認
        // viewProjection (64バイト) を 0バイト目から書き込む
        device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array(matrices.viewProjection));
        // view (64バイト) を 64バイト目から書き込む
        device.queue.writeBuffer(this.cameraBuffer, 64, new Float32Array(matrices.view));

        const commandEncoder = engine.device.createCommandEncoder();
        
        const cPass = commandEncoder.beginComputePass();
        this.computePass.dispatch(cPass, Math.ceil(this.numParticles / 64));
        cPass.end();

        const rPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: engine.getContext('main-canvas').getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
                loadOp: 'clear', storeOp: 'store'
            }],
            depthStencilAttachment: {
                // ★ 修正: エンジンから正式に取得する
                view: engine.getDepthView('main-canvas'),
                depthClearValue: 1.0, 
                depthLoadOp: 'clear', 
                depthStoreOp: 'store'
            }
        });

        this.renderPass.draw(rPass, this.sphereVertexCount, this.numParticles);
        rPass.end();

        engine.device.queue.submit([commandEncoder.finish()]);
    }
}