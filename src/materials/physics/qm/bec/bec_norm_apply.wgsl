// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_norm_apply
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
@group(0) @binding(1) var<storage, read_write> psiN: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> NormScalar: array<f32>;

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

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let w = i32(params.gridWidth);
    let h = i32(params.gridHeight);
    let x = i32(gid.x);
    let y = i32(gid.y);
    if (x >= w || y >= h) { return; }
    let idx = u32(y * w + x);

    let s = max(NormScalar[0], 1e-30);
    let scale = sqrt(params.particleNumber / s);
    var new_val = vec2<f32>(psiN[idx].x * scale, psiN[idx].y * scale);
    
    // ★ 追加: NaN(非数)汚染を検知した場合、強制的に微小な波として復活させる
    if (new_val.x != new_val.x || new_val.y != new_val.y) {
        new_val = vec2<f32>(0.01, 0.01);
    }
    
    psiN[idx] = new_val;
}