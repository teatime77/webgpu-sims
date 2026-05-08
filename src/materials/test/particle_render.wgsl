// src/materials/test/particle_render.wgsl

// ★ 1. カメラ用のUniform構造体を定義 (16 x 4 bytes = 64bytes が2つで計128bytes)
struct Camera {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> camera: Camera;

struct Particle { pos: vec4<f32>, vel: vec4<f32> };
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

@group(0) @binding(2) var<storage, read> baseMesh: array<f32>;

struct Varying {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> Varying {
    let offset = v_idx * 6u;
    let v_pos = vec3<f32>(baseMesh[offset], baseMesh[offset + 1u], baseMesh[offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[offset + 3u], baseMesh[offset + 4u], baseMesh[offset + 5u]);

    let p = particles[i_idx];
    let world_pos = v_pos + p.pos.xyz;
    
    var out: Varying;
    // ★ 2. カメラの viewProjection 行列を掛けて画面上の位置を計算
    out.pos = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    
    // ★ 3. 法線にも view 行列を掛けて、カメラから見た光の当たり方に補正する
    out.normal = (camera.view * vec4<f32>(v_norm, 0.0)).xyz;
    
    return out;
}

@fragment
fn fs_main(in: Varying) -> @location(0) vec4<f32> {
    let light = dot(normalize(vec3<f32>(1.0, 1.0, 1.0)), in.normal) * 0.5 + 0.5;
    return vec4<f32>(light, light * 0.7, 0.2, 1.0);
}