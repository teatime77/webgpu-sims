// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: md_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    interactionRadius: f32,
    stiffness: f32,
    boxSize: f32,
    time: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================
// PCG Hash for generating random seeds
fn pcg_hash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Converts a u32 hash to a float between 0.0 and 1.0
fn random(seed: u32) -> f32 {
    return f32(seed) / 4294967295.0; 
}

fn init(idx: u32) {
    var seeds: array<u32, 6>;
    
    // Seed the chain using the particle index to ensure unique values
    seeds[0] = pcg_hash(idx * 1000u + 1u);
    for (var i = 1u; i < 6u; i++) {
        seeds[i] = pcg_hash(seeds[i - 1]);
    }

    let box = params.boxSize;
    
    // Position: Random between -boxSize/2 and boxSize/2
    let pos_x = (random(seeds[0]) - 0.5) * box;
    let pos_y = (random(seeds[1]) - 0.5) * box;
    let pos_z = (random(seeds[2]) - 0.5) * box;
    
    // Velocity: Random between -2.0 and 2.0
    let vel_x = (random(seeds[3]) - 0.5) * 4.0;
    let vel_y = (random(seeds[4]) - 0.5) * 4.0;
    let vel_z = (random(seeds[5]) - 0.5) * 4.0;

    // Write to buffers (W component of position holds mass = 1.0)
    positions[idx] = vec4<f32>(pos_x, pos_y, pos_z, 1.0);
    velocities[idx] = vec4<f32>(vel_x, vel_y, vel_z, 0.0);
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let numParticles = arrayLength(&positions);
    if (idx >= numParticles) { return; }

    // Intercept for initialization pass
    if (params.time == 0.0) {
        init(idx);
        return;
    }

    // Fetch particle state
    var pos = positions[idx].xyz;
    var vel = velocities[idx].xyz;
    let mass = positions[idx].w; // Using the W component for mass

    // 1. Initialize forces with gravity (downward in Y axis)
    var force = vec3<f32>(0.0, -params.gravity * mass, 0.0);

    // 2. Particle-Particle Interactions (O(N^2) Repulsion)
    let r2 = params.interactionRadius * params.interactionRadius;
    
    for (var i = 0u; i < numParticles; i++) {
        if (i == idx) { continue; }
        
        let otherPos = positions[i].xyz;
        let diff = pos - otherPos;
        let distSq = dot(diff, diff);
        
        // If within interaction radius, apply repulsive force
        if (distSq > 0.0001 && distSq < r2) {
            let dist = sqrt(distSq);
            let overlap = params.interactionRadius - dist;
            let dir = diff / dist;
            
            // Linear spring model for repulsion (Hooke's Law)
            force += dir * overlap * params.stiffness;
        }
    }

    // 3. Integration (Semi-implicit Euler)
    let acc = force / mass;
    vel += acc * params.dt;
    
    // Apply a slight damping factor to simulate energy loss/friction
    vel *= 0.995;
    
    pos += vel * params.dt;

    // 4. Boundary Box Collisions
    let halfBox = params.boxSize * 0.5;
    let restitution = 0.8; // Bounciness against walls

    // X-axis boundaries
    if (pos.x < -halfBox) { pos.x = -halfBox; vel.x *= -restitution; }
    if (pos.x >  halfBox) { pos.x =  halfBox; vel.x *= -restitution; }
    
    // Y-axis boundaries
    if (pos.y < -halfBox) { pos.y = -halfBox; vel.y *= -restitution; }
    if (pos.y >  halfBox) { pos.y =  halfBox; vel.y *= -restitution; }
    
    // Z-axis boundaries
    if (pos.z < -halfBox) { pos.z = -halfBox; vel.z *= -restitution; }
    if (pos.z >  halfBox) { pos.z =  halfBox; vel.z *= -restitution; }

    // Write back state
    positions[idx] = vec4<f32>(pos, mass);
    velocities[idx] = vec4<f32>(vel, 0.0);
}