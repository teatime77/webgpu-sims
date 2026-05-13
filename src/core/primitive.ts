// src/core/primitive.ts
import { Vec3, vecSub, vecCross, vecNormalize } from './math/vec3';


export function msg(txt : string){
    console.log(txt);
}

export function range(n: number) : number[]{
    return [...Array(n).keys()];
}

function setPosNorm(v : Float32Array, base : number, x : number, y : number, z : number, nx : number, ny : number, nz : number){
    v[base    ] = x;
    v[base + 1] = y;
    v[base + 2] = z;

    v[base + 3] = nx;
    v[base + 4] = ny;
    v[base + 5] = nz;
}

/*
    makeTube creates a list of vertices for the 'triangle-strip' of the tube.
*/
export function makeTube(num_division : number = 16) : Float32Array {        
    const vertexCount = (num_division + 1) * 2;

    // 位置の配列
    const vertexArray = new Float32Array(vertexCount * (3 + 3));

    let base = 0;
    for(let idx of range(num_division + 1)){
        let theta = 2 * Math.PI * idx / num_division;
        let x = Math.cos(theta);
        let y = Math.sin(theta);

        for(const z of [0, 1]){

            setPosNorm(vertexArray, base, x, y, z, x, y, 0);
            base += 3 + 3;
        }
    }

    return vertexArray;
}



/**
 * Generates a vertex array (Pos3, Normal3) for a geodesic polyhedron (sphere).
 */
export function makeGeodesicPolyhedron(subdivisions: number = 2): Float32Array {
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

    // Subdivision logic (simplified)
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
    const r = 1.0;
    for (const f of faces) {
        for (const i of f) {
            const p = points[i];
            const n = p; // Since it is a sphere, the normal is in the same direction as the coordinates
            result[offset++] = p.x * r; result[offset++] = p.y * r; result[offset++] = p.z * r;
            result[offset++] = n.x; result[offset++] = n.y; result[offset++] = n.z;
        }
    }
    return result;
}


export function makeArrowMesh(shape : { numDivision?: number, scale? : [number, number, number], position? : [number, number, number]}): Float32Array<ArrayBuffer> {
    const radialSegments = shape.numDivision ?? 16;
    const shaftRadius = 0.01;  // Thinner to 0.01
    const headRadius = 0.03;   // Thinner to 0.03
    const headLength = 0.05;   // Shorter to 0.05

    
    // 1. Shaft side (radialSegments * 2 triangles)
    // 2. Head base (radialSegments triangles)
    // 3. Head side (radialSegments triangles)
    // Total triangles = radialSegments * 4
    // Total vertices = radialSegments * 12
    const vertexCount = radialSegments * 12;
    const vertexArray = new Float32Array(vertexCount * 6);
    
    let idx = 0;
    
    function pushVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
        vertexArray[idx++] = x;
        vertexArray[idx++] = y;
        vertexArray[idx++] = z;
        vertexArray[idx++] = nx;
        vertexArray[idx++] = ny;
        vertexArray[idx++] = nz;
    }
    
    for (let i = 0; i < radialSegments; i++) {
        const theta1 = (i * 2 * Math.PI) / radialSegments;
        const theta2 = ((i + 1) * 2 * Math.PI) / radialSegments;
        
        const cos1 = Math.cos(theta1);
        const sin1 = Math.sin(theta1);
        const cos2 = Math.cos(theta2);
        const sin2 = Math.sin(theta2);
        
        // --- 1. Shaft side ---
        pushVertex(cos1 * shaftRadius, 0.0, sin1 * shaftRadius, cos1, 0, sin1);
        pushVertex(cos2 * shaftRadius, 0.0, sin2 * shaftRadius, cos2, 0, sin2);
        pushVertex(cos1 * shaftRadius, 1.0, sin1 * shaftRadius, cos1, 0, sin1);
        
        pushVertex(cos1 * shaftRadius, 1.0, sin1 * shaftRadius, cos1, 0, sin1);
        pushVertex(cos2 * shaftRadius, 0.0, sin2 * shaftRadius, cos2, 0, sin2);
        pushVertex(cos2 * shaftRadius, 1.0, sin2 * shaftRadius, cos2, 0, sin2);
        
        // --- 2. Head base ---
        pushVertex(0, 1.0, 0, 0, -1, 0);
        pushVertex(cos2 * headRadius, 1.0, sin2 * headRadius, 0, -1, 0);
        pushVertex(cos1 * headRadius, 1.0, sin1 * headRadius, 0, -1, 0);
        
        // --- 3. Head side ---
        const slant = Math.sqrt(headRadius * headRadius + headLength * headLength);
        const ny = headRadius / slant;
        const nx1 = cos1 * headLength / slant;
        const nz1 = sin1 * headLength / slant;
        const nx2 = cos2 * headLength / slant;
        const nz2 = sin2 * headLength / slant;
        
        pushVertex(cos1 * headRadius, 1.0, sin1 * headRadius, nx1, ny, nz1);
        pushVertex(cos2 * headRadius, 1.0, sin2 * headRadius, nx2, ny, nz2);
        
        const nx_mid = (nx1 + nx2) / 2;
        const nz_mid = (nz1 + nz2) / 2;
        const len_mid = Math.sqrt(nx_mid*nx_mid + ny*ny + nz_mid*nz_mid);
        pushVertex(0, 1.0 + headLength, 0, nx_mid/len_mid, ny/len_mid, nz_mid/len_mid);
    }
    
    if(shape.scale != undefined){
        const [sx, sy, sz] = shape.scale;
        for(let i = 0; i < vertexArray.length; i +=6 ){
            vertexArray[i    ] *= sx;
            vertexArray[i + 1] *= sy;
            vertexArray[i + 2] *= sz;
        }
    }

    if(shape.position != undefined){
        const [dx, dy, dz] = shape.position;
        for(let i = 0; i < vertexArray.length; i +=6 ){
            vertexArray[i    ] += dx;
            vertexArray[i + 1] += dy;
            vertexArray[i + 2] += dz;
        }
    }

    return vertexArray;
}