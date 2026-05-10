// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_norm_total
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
@group(0) @binding(1) var<storage, read> PartialNorm: array<f32>;
@group(0) @binding(2) var<storage, read_write> NormScalar: array<f32>;

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

@compute @workgroup_size(1, 1, 1)
fn main() {
    let n = u32(params.partialNormCount);
    var sum = 0.0;
    for (var i = 0u; i < n; i++) {
        sum += PartialNorm[i];
    }
    NormScalar[0] = sum;
}