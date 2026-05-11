// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: lj_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    dt: f32,
    epsilon: f32,
    sigma: f32,
    boxSize: f32,
    damping: f32,
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

    var pos = positions[idx].xyz;
    var vel = velocities[idx].xyz;
    let p_type = positions[idx].w; // 0.0 or 1.0

    // Mass depends on particle type (Type 0 = lighter, Type 1 = heavier)
    let mass = mix(1.0, 2.0, p_type);

    var force = vec3<f32>(0.0);

    // Lennard-Jones interactions (O(N^2))
    // Standard cutoff for LJ is usually 2.5 or 3.0 * sigma to save computation
    let cutoff = params.sigma * 3.0;
    let cutoffSq = cutoff * cutoff;
    let sig2 = params.sigma * params.sigma;

    for (var i = 0u; i < numParticles; i++) {
        if (i == idx) { continue; }
        
        let otherPos = positions[i].xyz;
        let diff = pos - otherPos;
        let distSq = dot(diff, diff);
        
        // Calculate LJ force if within cutoff and to avoid division by zero
        if (distSq > 0.0001 && distSq < cutoffSq) {
            let s2 = sig2 / distSq;
            let s6 = s2 * s2 * s2;
            let s12 = s6 * s6;
            
            // LJ Force Magnitude = 24 * epsilon * (2 * (sigma/r)^12 - (sigma/r)^6) / r^2
            // We divide by r^2 because we multiply by the vector 'diff' next (which includes one 'r')
            let force_mag = 24.0 * params.epsilon * (2.0 * s12 - s6) / distSq;
            
            force += diff * force_mag;
        }
    }

    // Semi-implicit Euler integration
    let acc = force / mass;
    vel += acc * params.dt;
    
    // Apply the UI thermostat (damping) to drain excess thermal energy
    vel *= params.damping;
    
    pos += vel * params.dt;

    // Bounding Box Collisions
    let halfBox = params.boxSize * 0.5;
    let restitution = 0.5; // Absorb some energy upon wall impact
    
    // A small offset to prevent particles getting stuck exactly on the wall boundary
    let wallOffset = params.sigma * 0.5; 

    if (pos.x < -halfBox + wallOffset) { pos.x = -halfBox + wallOffset; vel.x *= -restitution; }
    if (pos.x >  halfBox - wallOffset) { pos.x =  halfBox - wallOffset; vel.x *= -restitution; }
    
    if (pos.y < -halfBox + wallOffset) { pos.y = -halfBox + wallOffset; vel.y *= -restitution; }
    if (pos.y >  halfBox - wallOffset) { pos.y =  halfBox - wallOffset; vel.y *= -restitution; }
    
    if (pos.z < -halfBox + wallOffset) { pos.z = -halfBox + wallOffset; vel.z *= -restitution; }
    if (pos.z >  halfBox - wallOffset) { pos.z =  halfBox - wallOffset; vel.z *= -restitution; }

    // Write back
    positions[idx] = vec4<f32>(pos, p_type);
    velocities[idx] = vec4<f32>(vel, 0.0);
}