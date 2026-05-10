// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_norm_partial
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct BecParamsStruct {
    gridWidth: f32,
    gridHeight: f32,
    temperature: f32,
    dt: f32,
    g: f32,
    omega: f32,
    particleNumber: f32,
    domainHalf: f32,
    time: f32,
    partialNormCount: f32,
};

@group(0) @binding(0) var<uniform> params: BecParamsStruct;
@group(0) @binding(1) var<storage, read> psiR: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> PartialNorm: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn idx_xy(x: i32, y: i32, w: i32, h: i32) -> u32 {
    let sx = clamp(x, 0, w - 1);
    let sy = clamp(y, 0, h - 1);
    return u32(sy * w + sx);
}

var<workgroup> norm_reduce_buf: array<f32, 64>;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let w = i32(params.gridWidth);
    let h = i32(params.gridHeight);
    let gx = i32(gid.x);
    let gy = i32(gid.y);
    let dx = (2.0 * params.domainHalf) / params.gridWidth;
    let cell_mass_scale = dx * dx;

    let tid = lid.y * 8u + lid.x;

    var cell = 0.0;
    if (gx < w && gy < h) {
        let p = psiR[u32(gy * w + gx)];
        cell = dot(p, p) * cell_mass_scale;
    }
    norm_reduce_buf[tid] = cell;
    workgroupBarrier();

    var s: u32 = 32u;
    loop {
        if (s == 0u) { break; }
        if (tid < s) {
            norm_reduce_buf[tid] += norm_reduce_buf[tid + s];
        }
        workgroupBarrier();
        s = s / 2u;
    }

    if (tid == 0u) {
        let wx = u32(params.gridWidth / 8.0);
        PartialNorm[wid.y * wx + wid.x] = norm_reduce_buf[0];
    }
}