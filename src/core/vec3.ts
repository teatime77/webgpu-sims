// src/core/math/vec3.ts
export class Vec3 {
    constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}

export function vecSub(a: Vec3, b: Vec3) {
    return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function vecCross(a: Vec3, b: Vec3) {
    return new Vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

export function vecNormalize(p: Vec3) {
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    if (len > 0) {
        return new Vec3(p.x / len, p.y / len, p.z / len);
    }
    return new Vec3();
}