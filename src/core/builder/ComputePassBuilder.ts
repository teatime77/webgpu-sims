// src/core/builder/ComputePassBuilder.ts

export class ComputePassBuilder {
    private device: GPUDevice;
    private pipeline: GPUComputePipeline;
    
    // グループごとのバインディングリソースを保持するMap
    // 例: Map { 0 => [entry1, entry2], 1 => [entry3] }
    private bindGroupEntries: Map<number, GPUBindGroupEntry[]> = new Map();
    
    private currentGroupIndex: number = 0;
    private currentBindingIndex: number = 0;

    constructor(device: GPUDevice, shaderCode: string, entryPoint: string = 'main') {
        this.device = device;
        
        // 1. シェーダモジュールの作成
        const module = device.createShaderModule({ 
            label: `Compute Module (${entryPoint})`,
            code: shaderCode 
        });

        // 2. パイプラインの作成 (layout: 'auto' によりWGSLから自動推論)
        this.pipeline = device.createComputePipeline({
            label: `Compute Pipeline (${entryPoint})`,
            layout: 'auto',
            compute: { module, entryPoint }
        });
    }

    /**
     * バインドグループのインデックス（@group(X)）を切り替えます。
     * このメソッドを呼ぶと、binding番号は0にリセットされます。
     */
    setGroup(groupIndex: number): this {
        this.currentGroupIndex = groupIndex;
        this.currentBindingIndex = 0; // グループが変わったらバインディング番号をリセット
        
        if (!this.bindGroupEntries.has(groupIndex)) {
            this.bindGroupEntries.set(groupIndex, []);
        }
        return this; // メソッドチェーン用
    }

    /**
     * Uniformバッファを追加します。(@binding の番号は自動でインクリメントされます)
     */
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
     * コンピュートパスをディスパッチ（実行）します。
     * 実行時に動的にBindGroupを生成してセットします。
     */
    dispatch(passEncoder: GPUComputePassEncoder, workgroupCountX: number, workgroupCountY: number = 1, workgroupCountZ: number = 1) {
        passEncoder.setPipeline(this.pipeline);

        // 登録されたすべてのグループに対してBindGroupを作成してセット
        for (const [groupIndex, entries] of this.bindGroupEntries.entries()) {
            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });
            passEncoder.setBindGroup(groupIndex, bindGroup);
        }

        // ワークグループのディスパッチ
        passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    }
    
    /**
     * 毎フレームバッファが切り替わる（ダブルバッファリング等の）場合、
     * エントリをクリアして再登録するためのメソッドです。
     */
    clearBindings() {
        this.bindGroupEntries.clear();
        this.currentGroupIndex = 0;
        this.currentBindingIndex = 0;
    }
}