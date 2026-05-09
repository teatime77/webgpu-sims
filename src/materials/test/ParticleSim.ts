// src/materials/test/ParticleSim.ts
import { WebGPUEngine } from '../../core/engine/WebGPUEngine';
import { ComputePassBuilder } from '../../core/builder/ComputePassBuilder';
import { RenderPassBuilder } from '../../core/builder/RenderPassBuilder';
import { makeGeodesicPolyhedron } from '../../core/primitive';
import { SimUI } from '../../core/ui/SimUI';

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

    // ★ 1. 状態を保持するパラメータオブジェクト
    public simParams = {
        speedScale: 1.0,
        colorR: 1.0,
        colorG: 0.7,
        colorB: 0.2,
    };

    // ... (既存のプロパティ) ...
    private paramsBuffer!: GPUBuffer; // ★ 追加    

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

        // ★ 2. パラメータ用Uniformバッファ (f32が4つ = 16バイト)
        this.paramsBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // ★ 3. UIの生成とデータバインディング (スライダーが動いたら simParams を上書きする)
        const ui = new SimUI();
        ui.addRange("Speed", 0.0, 5.0, 0.1, this.simParams.speedScale, v => this.simParams.speedScale = v);
        ui.addRange("Color R", 0.0, 1.0, 0.01, this.simParams.colorR, v => this.simParams.colorR = v);
        ui.addRange("Color G", 0.0, 1.0, 0.01, this.simParams.colorG, v => this.simParams.colorG = v);
        ui.addRange("Color B", 0.0, 1.0, 0.01, this.simParams.colorB, v => this.simParams.colorB = v);

        // ★ 修正: カメラ用バッファを 128バイト (64x2) で確保
        this.cameraBuffer = device.createBuffer({
            size: 128, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // ★ 4. Builderへの登録 (WGSLの @binding の番号と合わせる)
        this.computePass = new ComputePassBuilder(device, computeShader, 'main_compute')
            .setGroup(0)
            .addUniform(this.paramsBuffer, 0) // binding(0)
            .addStorage(this.particleBuffer, 1);

        this.renderPass = new RenderPassBuilder(device, renderShader, format, { depthFormat: 'depth24plus' })
            .setGroup(0)
            .addUniform(this.cameraBuffer, 0) // binding(0)
            .addStorage(this.particleBuffer, 1)
            .addStorage(this.baseMeshBuffer, 2)
            .addUniform(this.paramsBuffer, 3); // binding(3) 追加
    }

    update(engine: WebGPUEngine, matrices: { viewProjection: number[], view: number[] }, cameraDistance?: number) {
        const device = engine.device;

        // ★ 重要: 書き込み先が this.cameraBuffer になっているか確認
        // viewProjection (64バイト) を 0バイト目から書き込む
        device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array(matrices.viewProjection));
        // view (64バイト) を 64バイト目から書き込む
        device.queue.writeBuffer(this.cameraBuffer, 64, new Float32Array(matrices.view));


        // ★ 5. パラメータの転送 (V1の DataView に代わる、よりシンプルで高速な方法)
        const pArray = new Float32Array([
            this.simParams.speedScale,
            this.simParams.colorR,
            this.simParams.colorG,
            this.simParams.colorB
        ]);
        device.queue.writeBuffer(this.paramsBuffer, 0, pArray);



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