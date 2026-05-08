// src/core/primitive.ts
import { Vec3, vecSub, vecCross, vecNormalize } from './math/vec3';

/**
 * ジオデシック多面体（球体）の頂点配列（Pos3, Normal3）を生成します。
 */
export function makeGeodesicPolyhedron(r: number, subdivisions: number): Float32Array {
    const t = (1.0 + Math.sqrt(5.0)) / 2.0;
    let points = [
        new Vec3(-1, t, 0), new Vec3(1, t, 0), new Vec3(-1, -t, 0), new Vec3(1, -t, 0),
        new Vec3(0, -1, t), new Vec3(0, 1, t), new Vec3(0, -1, -t), new Vec3(0, 1, -t),
        new Vec3(t, 0, -1), new Vec3(t, 0, 1), new Vec3(-t, 0, -1), new Vec3(-t, 0, 1)
    ].map(p => vecNormalize(p));

    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    // 細分割ロジック（簡略化）
    for (let s = 0; s < subdivisions; s++) {
        let newFaces: number[][] = [];
        let midpointCache = new Map<string, number>();

        const getMidpoint = (a: number, b: number) => {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (midpointCache.has(key)) return midpointCache.get(key)!;
            const p1 = points[a];
            const p2 = points[b];
            const mid = vecNormalize(new Vec3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2));
            points.push(mid);
            const idx = points.length - 1;
            midpointCache.set(key, idx);
            return idx;
        };

        for (const f of faces) {
            const m01 = getMidpoint(f[0], f[1]);
            const m12 = getMidpoint(f[1], f[2]);
            const m20 = getMidpoint(f[2], f[0]);
            newFaces.push([f[0], m01, m20], [f[1], m12, m01], [f[2], m20, m12], [m01, m12, m20]);
        }
        faces = newFaces;
    }

    const result = new Float32Array(faces.length * 3 * 6);
    let offset = 0;
    for (const f of faces) {
        for (const i of f) {
            const p = points[i];
            const n = p; // 球体なので法線は座標と同じ方向
            result[offset++] = p.x * r; result[offset++] = p.y * r; result[offset++] = p.z * r;
            result[offset++] = n.x; result[offset++] = n.y; result[offset++] = n.z;
        }
    }
    return result;
}