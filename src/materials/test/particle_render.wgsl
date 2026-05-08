// src/materials/test/particle_render.wgsl

struct Particle { pos: vec4<f32>, vel: vec4<f32> };
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

// ★ 修正: array<f32> として受け取り、16バイトアライメント問題を回避
@group(0) @binding(2) var<storage, read> baseMesh: array<f32>;

struct Varying {
    @builtin(position) pos: vec4<f32>,
    @location(0) normal: vec3<f32>
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> Varying {
    // ★ 修正: V1と同じ方法で、6つのfloatを自力で切り出す
    let offset = v_idx * 6u;
    let v_pos = vec3<f32>(baseMesh[offset], baseMesh[offset + 1u], baseMesh[offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[offset + 3u], baseMesh[offset + 4u], baseMesh[offset + 5u]);

    let p = particles[i_idx];
    var out: Varying;
    
    let world_pos = v_pos + p.pos.xyz;
    
    // WebGPUのZ座標クリッピング (0.0 ~ 1.0) を回避するため、
    // 全体を少し縮小してZを奥に押し込む簡易的な投影
    out.pos = vec4<f32>(world_pos.x * 0.5, world_pos.y * 0.5, world_pos.z * 0.5 + 0.5, 1.0);
    out.normal = v_norm;
    
    return out;
}

@fragment
fn fs_main(in: Varying) -> @location(0) vec4<f32> {
    let light = dot(normalize(vec3<f32>(1.0, 1.0, 1.0)), in.normal) * 0.5 + 0.5;
    return vec4<f32>(light, light * 0.7, 0.2, 1.0);
}