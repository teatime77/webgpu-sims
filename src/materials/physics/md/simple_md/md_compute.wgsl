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
    pad1: f32,
    pad2: f32,
    pad3: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let numParticles = arrayLength(&positions);
    if (idx >= numParticles) { return; }

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