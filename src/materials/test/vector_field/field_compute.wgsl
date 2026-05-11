// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: field_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    time: f32,
    fieldScale: f32,
    pad1: f32,
    pad2: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vectors: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&positions)) { return; }

    // Fetch the grid point position
    let pos = positions[idx].xyz;
    let t = params.time;

    // A mathematical vector field (Arnold-Beltrami-Childress (ABC) inspired flow)
    // This creates beautiful twisting, non-intersecting vortices that evolve over time.
    let vx = sin(pos.y * 1.5 + t) + cos(pos.z * 1.5 - t);
    let vy = sin(pos.z * 1.5 + t) + cos(pos.x * 1.5 - t);
    let vz = sin(pos.x * 1.5 + t) + cos(pos.y * 1.5 - t);

    // Calculate magnitude (length) of the vector
    let mag = length(vec3<f32>(vx, vy, vz));

    // Store the vector components and the magnitude in the W component
    vectors[idx] = vec4<f32>(vx, vy, vz, mag);
}