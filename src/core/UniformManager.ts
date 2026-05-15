// src/core/UniformManager.ts

import { assert } from "./CaptureTool";
import { getElementSizeAlignment, MyError } from "./utils";

export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';

interface FieldInfo {
    byteOffset: number;
    format: WgslFormat;
}

export class UniformManager {
    private layouts = new Map<string, { totalSize: number, offsets: Record<string, FieldInfo> }>();
    private uniformBuffers = new Map<string, GPUBuffer>();
    private device: GPUDevice;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /** Equivalent to buildUniformLayouts in V1: automatically calculate padding from struct fields and create buffer */
    register(id: string, fields: Record<string, WgslFormat>): GPUBuffer {
        let currentOffset = 0;
        const offsets: Record<string, FieldInfo> = {};

        for (const [fieldName, format] of Object.entries(fields)) {
            const [size, alignment] = getElementSizeAlignment(format);

            // Round up offset to alignment boundary (insert padding)
            currentOffset = Math.ceil(currentOffset / alignment) * alignment;
            offsets[fieldName] = { byteOffset: currentOffset, format };
            currentOffset += size;
        }

        // Round up total size to 16 byte boundary as well
        const totalSize = Math.ceil(currentOffset / 16) * 16;
        const buffer = this.device.createBuffer({
            label: `Uniform_${id}`,
            size: totalSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.layouts.set(id, { totalSize, offsets });
        this.uniformBuffers.set(id, buffer);
        return buffer;
    }

    getUniformManagerBuffer(id: string): GPUBuffer {
        const buf = this.uniformBuffers.get(id);
        if (!buf){
            throw new MyError(`Uniform [${id}] not found`);
        }
        return buf;
    }
}