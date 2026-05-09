// src/core/engine/ResourceWrapper.ts

export class ResourceWrapper {
    public id: string;
    public buffers: GPUBuffer[];
    public bufferCount: number;
    public currentIndex: number = 0;

    constructor(id: string, buffers: GPUBuffer[], bufferCount: number) {
        // コンストラクタ内で代入する
        this.id = id;
        this.buffers = buffers;
        this.bufferCount = bufferCount;
    }

    /** historyLevel: 0 が現在の書き込み面、1 が1ステップ前のデータ */
    getBuffer(historyLevel: number = 0): GPUBuffer {
        const n = this.bufferCount;
        const idx = (this.currentIndex + n - historyLevel) % n;
        return this.buffers[idx];
    }

    /** フレーム/ステップ終了時にリングを回す */
    swap(): void {
        this.currentIndex = (this.currentIndex + 1) % this.bufferCount;
    }
}