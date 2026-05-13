// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: physics_and_transform_compute
// ==========================================

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    baseLength: f32,
    bobRadius: f32,
    stringThickness: f32,
    initialize: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> stateBuffer: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> Tubes: array<f32>;
@group(0) @binding(3) var<storage, read_write> Spheres: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

// Writes 12 floats: Base Pos (3), Vector (3), Radius (1), Padding (1), Color (4)
fn write_tube_params(idx: u32, base_pos: vec3<f32>, vec_to_top: vec3<f32>, radius: f32, color: vec4<f32>) {
    let offset = idx * 12u;
    
    // 1. Position of the center of the base (3 floats)
    Tubes[offset + 0u] = base_pos.x; 
    Tubes[offset + 1u] = base_pos.y; 
    Tubes[offset + 2u] = base_pos.z;
    
    // 2. Vector from base to top (3 floats)
    Tubes[offset + 3u] = vec_to_top.x; 
    Tubes[offset + 4u] = vec_to_top.y; 
    Tubes[offset + 5u] = vec_to_top.z;
    
    // 3. Radius (1 float)
    Tubes[offset + 6u] = radius;
    
    // 4. Padding (1 float - keeps memory aligned to 4-float/16-byte boundaries)
    Tubes[offset + 7u] = 0.0;
    
    // 5. Color (4 floats)
    Tubes[offset + 8u]  = color.r; 
    Tubes[offset + 9u]  = color.g; 
    Tubes[offset + 10u] = color.b; 
    Tubes[offset + 11u] = color.a;
}

// Writes 8 floats: Center Pos (3), Radius (1), Color (4)
fn write_sphere_params(idx: u32, center: vec3<f32>, radius: f32, color: vec4<f32>) {
    let offset = idx * 8u;
    
    // 1. Center Position (3 floats)
    Spheres[offset + 0u] = center.x; 
    Spheres[offset + 1u] = center.y; 
    Spheres[offset + 2u] = center.z;
    
    // 2. Radius (1 float - acts as natural padding for the vec3!)
    Spheres[offset + 3u] = radius;
    
    // 3. Color (4 floats)
    Spheres[offset + 4u] = color.r; 
    Spheres[offset + 5u] = color.g; 
    Spheres[offset + 6u] = color.b; 
    Spheres[offset + 7u] = color.a;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let num_pendulums = arrayLength(&stateBuffer);
    if (idx >= num_pendulums) { return; }

    // ==========================================
    // 1. PHYSICS INTEGRATION
    // ==========================================
    if (params.initialize == 1.0) {
        let z_offset = (f32(idx) - f32(num_pendulums) / 2.0) * 1.0;
        let frequency_factor = 1.0 + f32(idx) * 0.05;
        let L = params.baseLength / (frequency_factor * frequency_factor);
        stateBuffer[idx] = vec4<f32>(0.5, 0.0, z_offset, L); // theta, omega, z, L
        return;
    }

    var state = stateBuffer[idx];
    let theta = state.x;
    var omega = state.y;
    let z_offset = state.z;
    let L = state.w;

    omega += -(params.gravity / L) * sin(theta) * params.dt;
    let new_theta = theta + omega * params.dt;
    stateBuffer[idx] = vec4<f32>(new_theta, omega, z_offset, L);

    // ==========================================
    // 2. PARAMETER PACKING (No Matrices!)
    // ==========================================
    
    // Common variables
    let pivot = vec3<f32>(0.0, 0.0, z_offset);
    // The vector pointing from the pivot to the bob
    let string_vec = vec3<f32>(L * sin(new_theta), -L * cos(new_theta), 0.0);
    
    // --- TUBE (STRING) DATA ---
    let tube_color = vec4<f32>(0.7, 0.7, 0.7, 1.0);
    write_tube_params(
        idx, 
        pivot,                  // Base is at the pivot
        string_vec,             // Vector reaching down to the bob
        params.stringThickness, // Radius
        tube_color
    );

    // --- BOB (SPHERE) DATA ---
    let bob_center = pivot + string_vec; // Center is exactly at the end of the string
    let hue = f32(idx) / f32(num_pendulums);
    let bob_color = vec4<f32>(0.2 + hue * 0.8, 0.6, 1.0 - hue * 0.5, 1.0);
    
    write_sphere_params(
        idx,
        bob_center,
        params.bobRadius,
        bob_color
    );
}