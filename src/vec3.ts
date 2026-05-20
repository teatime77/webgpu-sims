// src/core/math/vec3.ts
export class Vec3 {
    x: number;
    y: number;
    z: number;

    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
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