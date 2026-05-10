// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_rk4_k3
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
    pad1: f32,
    pad2: f32,
};

@group(0) @binding(0) var<uniform> params: BecParamsStruct;
@group(0) @binding(1) var<storage, read> psi0: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> K2: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> K3: array<vec2<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

fn idx_xy(x: i32, y: i32, w: i32, h: i32) -> u32 {
    let sx = clamp(x, 0, w - 1);
    let sy = clamp(y, 0, h - 1);
    return u32(sy * w + sx);
}

fn get_state(x: i32, y: i32, w: i32, h: i32) -> vec2<f32> {
    let i = idx_xy(x, y, w, h);
    return psi0[i] + K2[i] * 0.5;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let w = i32(params.gridWidth);
    let h = i32(params.gridHeight);
    let x = i32(gid.x);
    let y = i32(gid.y);
    if (x >= w || y >= h) { return; }
    let idx = u32(y * w + x);

    let psi_c = get_state(x, y, w, h);
    let lap = get_state(x + 1, y, w, h) + get_state(x - 1, y, w, h)
            + get_state(x, y + 1, w, h) + get_state(x, y - 1, w, h)
            - 4.0 * psi_c;

    let dx = (2.0 * params.domainHalf) / params.gridWidth;
    let inv_dx2 = 1.0 / (dx * dx);

    let fx = (f32(x) + 0.5) / params.gridWidth * 2.0 * params.domainHalf - params.domainHalf;
    let fy = (f32(y) + 0.5) / params.gridHeight * 2.0 * params.domainHalf - params.domainHalf;
    let pot = 0.5 * params.omega * params.omega * (fx*fx + fy*fy) + params.g * dot(psi_c, psi_c);

    let hpsi = vec2<f32>(lap.x * -0.5 * inv_dx2, lap.y * -0.5 * inv_dx2) + vec2<f32>(psi_c.x * pot, psi_c.y * pot);

    let t_factor = clamp((params.temperature - 0.15) / 2.85, 0.0, 1.0);
    let gamma = mix(0.15, 0.03, t_factor);

    let rhs = vec2<f32>(hpsi.y - gamma * hpsi.x, -hpsi.x - gamma * hpsi.y);

    K3[idx] = rhs * params.dt;
}