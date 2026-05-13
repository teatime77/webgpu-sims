// src/core/engine/ResourceWrapper.ts

import type { MeshDef } from "./SimulationBase";

export class ResourceWrapper {
    public id: string;
    public buffers: GPUBuffer[];
    public bufferCount: number;
    public currentIndex: number = 0;
    mesh?: MeshDef;

    constructor(id: string, buffers: GPUBuffer[], bufferCount: number, mesh?: MeshDef) {
        // Assign inside constructor
        this.id = id;
        this.buffers = buffers;
        this.bufferCount = bufferCount;
        this.mesh = mesh;
    }

    /** historyLevel: 0 is the current write surface, 1 is the data from 1 step ago */
    getBuffer(historyLevel: number = 0): GPUBuffer {
        const n = this.bufferCount;
        const idx = (this.currentIndex + n - historyLevel) % n;
        return this.buffers[idx];
    }

    /** Rotate the ring at the end of the frame/step */
    swap(): void {
        this.currentIndex = (this.currentIndex + 1) % this.bufferCount;
    }
}