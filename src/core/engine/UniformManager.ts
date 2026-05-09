// src/core/engine/UniformManager.ts

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

    /** V1の buildUniformLayouts と同等: 構造体フィールドからパディングを自動計算してバッファを作成 */
    register(id: string, fields: Record<string, WgslFormat>): GPUBuffer {
        let currentOffset = 0;
        const offsets: Record<string, FieldInfo> = {};

        for (const [fieldName, format] of Object.entries(fields)) {
            let alignment = 4;
            let size = 4;
            if (format === 'vec2<f32>') { alignment = 8; size = 8; }
            else if (format === 'vec3<f32>' || format === 'vec4<f32>') { alignment = 16; size = 16; }
            else if (format === 'mat4x4<f32>') { alignment = 16; size = 64; }

            // アライメント境界に合わせてオフセットを切り上げ（パディング挿入）
            currentOffset = Math.ceil(currentOffset / alignment) * alignment;
            offsets[fieldName] = { byteOffset: currentOffset, format };
            currentOffset += size;
        }

        // 全体サイズも16バイト境界に切り上げ
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

    /** V1の updateVariables と同等: JSオブジェクトからバイナリを構築して一括転送 */
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
                view.setFloat32(info.byteOffset, val, true); // true = リトルエンディアン
            } else if (info.format === 'u32') {
                view.setUint32(info.byteOffset, val, true);
            } else if (info.format === 'i32') {
                view.setInt32(info.byteOffset, val, true);
            } else if (Array.isArray(val) || val instanceof Float32Array) {
                // vec2, vec3, vec4, mat4x4 等の配列書き込み
                for (let i = 0; i < val.length; i++) {
                    view.setFloat32(info.byteOffset + i * 4, val[i], true);
                }
            }
        }
        this.device.queue.writeBuffer(buffer, 0, arrayBuffer);
    }
}