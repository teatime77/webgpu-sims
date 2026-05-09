// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital_render.wgsl

struct Camera {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> camera: Camera;

struct Particle {
    pos: vec4<f32>,
};
// 計算されたパーティクル位置（読み取り専用）
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct Params {
    orbitalMode: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
    pad1: f32,
    pad2: f32,
    pad3: f32,
};
@group(0) @binding(3) var<uniform> params: Params;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

// --- Vertex Shader ---
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    let p = particles[vi].pos.xyz;
    
    var out: VertexOutput;
    
    // カメラのビュープロジェクション行列を掛けて画面上の位置を計算
    out.position = camera.viewProjection * vec4<f32>(p, 1.0);
    
    // 軌道の種類に応じて色を変える
    let col1 = vec3<f32>(0.1, 0.6, 1.0); // 青
    let col2 = vec3<f32>(1.0, 0.5, 0.1); // オレンジ
    out.color = mix(col1, col2, params.colorMix);
    
    return out;
}

// --- Fragment Shader ---
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // ★ 加算合成前提：1点の明るさをパラメータで制御し、飽和（白抜け）を防ぐ
    let alpha = params.brightness;
    return vec4<f32>(in.color * alpha, alpha);
}