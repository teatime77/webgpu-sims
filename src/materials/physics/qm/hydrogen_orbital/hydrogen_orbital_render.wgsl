// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: hydrogen_orbital_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    orbitalMode: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: ParamsStruct;

// --- YOUR RENDER LOGIC BELOW ---

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    let pos = particles[v_idx].xyz;
    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);

    // 位置に応じた色付け（中心からの距離）
    let r = length(pos);
    let hue = (r * 0.1) % 1.0;
    
    // パラメータに基づいた色のブレンド
    let c1 = vec3<f32>(0.2, 0.6, 1.0); // 青
    let c2 = vec3<f32>(1.0, 0.3, 0.1); // 赤
    let color = mix(c1, c2, clamp(r * 0.05, 0.0, 1.0) * params.colorMix);

    out.color = vec4<f32>(color * params.brightness, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}