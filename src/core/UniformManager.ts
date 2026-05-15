// src/core/engine/UniformManager.ts

import { getElementSizeAlignment } from "./utils";

export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';

interface FieldInfo {
    byteOffset: number;
    format: WgslFormat;
}

export class UniformManager {
    private layouts = new Map<string, { totalSize: number, offsets: Record<string, FieldInfo> }>();
    private buffers = new Map<string, GPUBuffer>();
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
        this.buffers.set(id, buffer);
        return buffer;
    }

    getBuffer(id: string): GPUBuffer {
        const buf = this.buffers.get(id);
        if (!buf) throw new Error(`Uniform [${id}] not found`);
        return buf;
    }

    /** Equivalent to updateVariables in V1: construct binary from JS object and transfer at once */
    update(id: string, values: Record<string, any>) {
        const layout = this.layouts.get(id);
        const buffer = this.buffers.get(id);
        if (!layout || !buffer) return;

        const arrayBuffer = new ArrayBuffer(layout.totalSize);
        const view = new DataView(arrayBuffer);

        for (const [key, val] of Object.entries(values)) {
            const info = layout.offsets[key];
            if (!info || val === undefined) continue;

            if (info.format === 'f32') {
                view.setFloat32(info.byteOffset, val, true); // true = little endian
            } else if (info.format === 'u32') {
                view.setUint32(info.byteOffset, val, true);
            } else if (info.format === 'i32') {
                view.setInt32(info.byteOffset, val, true);
            } else if (Array.isArray(val) || val instanceof Float32Array) {
                // Array writing for vec2, vec3, vec4, mat4x4 etc.
                for (let i = 0; i < val.length; i++) {
                    view.setFloat32(info.byteOffset + i * 4, val[i], true);
                }
            }
        }
        this.device.queue.writeBuffer(buffer, 0, arrayBuffer);
    }
}