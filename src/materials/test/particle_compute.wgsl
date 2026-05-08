// src/materials/test/particle_compute.wgsl

struct Particle { pos: vec4<f32>, vel: vec4<f32> };
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn main_compute(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&particles)) { return; }
    
    var p = particles[idx];
    p.pos += p.vel;
    
    if (abs(p.pos.x) > 1.0) { p.vel.x *= -1.0; }
    if (abs(p.pos.y) > 1.0) { p.vel.y *= -1.0; }
    if (abs(p.pos.z) > 1.0) { p.vel.z *= -1.0; }
    
    particles[idx] = p;
}