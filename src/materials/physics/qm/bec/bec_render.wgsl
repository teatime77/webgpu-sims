// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_render
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
@group(0) @binding(1) var<storage, read> Psi: array<vec2<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================



struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_idx: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
    );
    var out: VertexOutput;
    out.position = vec4<f32>(pos[vertex_idx], 0.0, 1.0);
    out.uv = pos[vertex_idx] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

fn idx_xy(x: i32, y: i32, w: i32, h: i32) -> u32 {
    let sx = clamp(x, 0, w - 1);
    let sy = clamp(y, 0, h - 1);
    return u32(sy * w + sx);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let w = u32(params.gridWidth);
    let h = u32(params.gridHeight);
    let x = min(u32(in.uv.x * f32(w)), w - 1u);
    let y = min(u32(in.uv.y * f32(h)), h - 1u);
    let xi = i32(x);
    let yi = i32(y);
    let ww = i32(params.gridWidth);
    let hh = i32(params.gridHeight);

    let psi = Psi[y * w + x];
    let rho = dot(psi, psi);
    let u = clamp((params.temperature - 0.15) / 2.85, 0.0, 1.0);

    var rho_mx = rho;
    let qxp = Psi[idx_xy(xi + 1, yi, ww, hh)]; rho_mx = max(rho_mx, dot(qxp, qxp));
    let qxm = Psi[idx_xy(xi - 1, yi, ww, hh)]; rho_mx = max(rho_mx, dot(qxm, qxm));
    let qyp = Psi[idx_xy(xi, yi + 1, ww, hh)]; rho_mx = max(rho_mx, dot(qyp, qyp));
    let qym = Psi[idx_xy(xi, yi - 1, ww, hh)]; rho_mx = max(rho_mx, dot(qym, qym));
    let qpp = Psi[idx_xy(xi + 1, yi + 1, ww, hh)]; rho_mx = max(rho_mx, dot(qpp, qpp));
    let qmm = Psi[idx_xy(xi - 1, yi - 1, ww, hh)]; rho_mx = max(rho_mx, dot(qmm, qmm));
    let qpm = Psi[idx_xy(xi + 1, yi - 1, ww, hh)]; rho_mx = max(rho_mx, dot(qpm, qpm));
    let qmp = Psi[idx_xy(xi - 1, yi + 1, ww, hh)]; rho_mx = max(rho_mx, dot(qmp, qmp));

    let knee = max(rho_mx * 0.55, 3e-5);
    let rho_rel = rho / (rho + knee);
    let rho_sqrt = sqrt(max(rho, 0.0));
    let rho_vis = clamp(mix(rho_rel * 1.15, rho_sqrt * 12.0, 0.35), 0.0, 1.0);

    let edge = smoothstep(0.04, 0.97, rho_vis);

    let phase = atan2(psi.y, psi.x);
    let hue_core = vec3<f32>(
        0.35 + 0.55 * cos(phase),
        0.55 + 0.35 * sin(phase + 1.3),
        0.75 + 0.25 * cos(phase - 0.7)
    );
    let hue_hot = vec3<f32>(1.0, 0.55 + 0.15 * sin(phase), 0.18);

    let tint = mix(hue_core, hue_hot, u);
    let tint_clamped = clamp(tint, vec3<f32>(0.0), vec3<f32>(1.0));

    let bg = vec3<f32>(0.02, 0.025, 0.04);
    let col = mix(bg, tint_clamped, edge * rho_vis);
    return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}