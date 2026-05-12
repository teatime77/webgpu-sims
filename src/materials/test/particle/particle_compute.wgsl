// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: particle_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    speedScale: f32,
    colorR: f32,
    colorG: f32,
    colorB: f32,
    init  : f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================
// A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm or PCG
fn pcg_hash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Generates a float between 0 and 1
fn random(seed: u32) -> f32 {
    return f32(seed) / 4294967295.0; 
}

fn init(idx : u32, p_idx : u32){
    var seeds: array<u32, 6>;
    var pos  : vec4<f32>;
    var vel  : vec4<f32>;

    seeds[0] = pcg_hash(idx * 1000u);
    for (var i = 1u; i < 6u; i++) {
        seeds[i] = pcg_hash(seeds[i - 1]);
    }

    pos.x = (random(seeds[0]) - 0.5) * 2.0;
    pos.y = (random(seeds[1]) - 0.5) * 2.0;
    pos.z = (random(seeds[2]) - 0.5) * 2.0;
    pos.w = 0.0;

    vel.x = (random(seeds[3]) - 0.5) * 0.02;
    vel.y = (random(seeds[4]) - 0.5) * 0.02;
    vel.z = (random(seeds[5]) - 0.5) * 0.02;
    vel.w = 0.0;

    particles[p_idx]      = pos;
    particles[p_idx + 1u] = vel;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    
    // Total number of particles (each particle uses two vec4s: pos and vel)
    let num_particles = arrayLength(&particles) / 2u;
    if (idx >= num_particles) { return; }

    let p_idx = idx * 2u;

    if(params.init == 1.0){
        init(idx, p_idx);
        return;
    }

    var pos = particles[p_idx];
    var vel = particles[p_idx + 1u];

    // Update position (velocity * UI slider value)
    pos += vel * params.speedScale;

    // Bounce check at boundaries (space from -1.0 to 1.0)
    if (abs(pos.x) > 1.0) { vel.x *= -1.0; pos.x = sign(pos.x); }
    if (abs(pos.y) > 1.0) { vel.y *= -1.0; pos.y = sign(pos.y); }
    if (abs(pos.z) > 1.0) { vel.z *= -1.0; pos.z = sign(pos.z); }

    // Write back to buffer
    particles[p_idx] = pos;
    particles[p_idx + 1u] = vel;
}