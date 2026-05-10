// src/core/builder/RenderPassBuilder.ts

export interface RenderPassOptions {
    topology?: GPUPrimitiveTopology; // 'triangle-list', 'line-list', 'point-list'
    depthFormat?: GPUTextureFormat;  // 深度テストを使う場合は 'depth24plus' 等を指定
    blendMode?: 'opaque' | 'alpha' | 'add' | 'normal'; // 簡易的なブレンド指定
    // ※V2の基本戦略はVertex Pullingなので、vertexLayoutsは省略（必要に応じて追加可能）
}

export class RenderPassBuilder {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroupEntries: Map<number, GPUBindGroupEntry[]> = new Map();
    private currentGroupIndex: number = 0;
    private currentBindingIndex: number = 0;
    hasDepth : boolean = true;

    constructor(
        device: GPUDevice, 
        shaderCode: string, 
        presentationFormat: GPUTextureFormat,
        options: RenderPassOptions = {}
    ) {
        this.device = device;
        const topology = options.topology || 'triangle-list';

        // 1. シェーダモジュールの作成（VSとFSを1ファイルに書く前提）
        const module = device.createShaderModule({
            label: 'Render Module',
            code: shaderCode
        });

        // 2. ブレンドステートの決定
        let blendState: GPUBlendState | undefined = undefined;
        if (options.blendMode === 'alpha') {
            blendState = {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            };
        } else if (options.blendMode === 'add') {
            blendState = {
                color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
            };
        }

        // 3. デプスステンシルステートの決定
        let depthStencil: GPUDepthStencilState | undefined = undefined;
        if (options.depthFormat) {
            depthStencil = {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: options.depthFormat,
            };
        }

        // 4. パイプラインの作成 (layout: 'auto' でバインディングを自動解決)
        this.pipeline = device.createRenderPipeline({
            label: `Render Pipeline`,
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [] // ★ Vertex Pulling専用設計なので空配列
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{
                    format: presentationFormat,
                    blend: blendState
                }]
            },
            primitive: { 
                topology: topology,
                cullMode: 'none' // 必要に応じて 'back' 等に変更可能にする
            },
            depthStencil: depthStencil
        });
    }

    // --- ComputePassBuilderと全く同じインターフェース ---
    setGroup(groupIndex: number): this {
        this.currentGroupIndex = groupIndex;
        this.currentBindingIndex = 0;
        if (!this.bindGroupEntries.has(groupIndex)) {
            this.bindGroupEntries.set(groupIndex, []);
        }
        return this;
    }

    // 第2引数 explicitBinding を追加
    addUniform(buffer: GPUBuffer, explicitBinding?: number): this {
        const binding = explicitBinding ?? this.currentBindingIndex;
        this.bindGroupEntries.get(this.currentGroupIndex)!.push({
            binding: binding,
            resource: { buffer }
        });
        this.currentBindingIndex = binding + 1; // 次の自動採番に備える
        return this;
    }

    // 第2引数 explicitBinding を追加
    addStorage(buffer: GPUBuffer, explicitBinding?: number): this {
        const binding = explicitBinding ?? this.currentBindingIndex;
        this.bindGroupEntries.get(this.currentGroupIndex)!.push({
            binding: binding,
            resource: { buffer }
        });
        this.currentBindingIndex = binding + 1; // 次の自動採番に備える
        return this;
    }

    /**
     * レンダーパスを実行します。
     */
    draw(passEncoder: GPURenderPassEncoder, vertexCount: number, instanceCount: number = 1) {
        passEncoder.setPipeline(this.pipeline);

        for (const [groupIndex, entries] of this.bindGroupEntries.entries()) {
            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });
            passEncoder.setBindGroup(groupIndex, bindGroup);
        }

        passEncoder.draw(vertexCount, instanceCount, 0, 0);
    }

    clearBindings() {
        this.bindGroupEntries.clear();
        this.currentGroupIndex = 0;
        this.currentBindingIndex = 0;
    }
}