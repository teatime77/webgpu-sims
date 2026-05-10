// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_init
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
@group(0) @binding(1) var<storage, read_write> psiOut: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> rng: array<u32>;

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

    let fx = (f32(x) + 0.5) / params.gridWidth * 2.0 * params.domainHalf - params.domainHalf;
    let fy = (f32(y) + 0.5) / params.gridHeight * 2.0 * params.domainHalf - params.domainHalf;
    let r2 = fx*fx + fy*fy;
    let sigma = params.domainHalf * 0.52;
    let amp = exp(-r2 / (sigma * sigma));

    let seed = u32(y * w + x);
    rng[seed] = pcg_hash(seed ^ 0x9e3779b9u);
    // let rand_val = f32(rng[seed]) / f32(0xffffffffu);
    // let phase = 6.2831853 * rand_val;
    
    // psiOut[seed] = vec2<f32>(amp * cos(phase), amp * sin(phase));

    // Remove the random phase generation and set it to a constant
    let phase = 0.0; 
    psiOut[seed] = vec2<f32>(amp * cos(phase), amp * sin(phase));
}