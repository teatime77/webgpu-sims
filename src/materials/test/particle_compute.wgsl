// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: particle_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    speedScale: f32,
    colorR: f32,
    colorG: f32,
    colorB: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    
    // パーティクルの総数 (1パーティクルにつき pos と vel の2つの vec4 を使用)
    let num_particles = arrayLength(&particles) / 2u;
    if (idx >= num_particles) { return; }

    let p_idx = idx * 2u;
    var pos = particles[p_idx];
    var vel = particles[p_idx + 1u];

    // 位置の更新 (速度 × UIのスライダー値)
    pos += vel * params.speedScale;

    // 壁でのバウンド判定 (-1.0 ~ 1.0 の空間)
    if (abs(pos.x) > 1.0) { vel.x *= -1.0; pos.x = sign(pos.x); }
    if (abs(pos.y) > 1.0) { vel.y *= -1.0; pos.y = sign(pos.y); }
    if (abs(pos.z) > 1.0) { vel.z *= -1.0; pos.z = sign(pos.z); }

    // バッファに書き戻す
    particles[p_idx] = pos;
    particles[p_idx + 1u] = vel;
}