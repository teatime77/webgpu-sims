// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: field_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    time: f32,
    fieldScale: f32,
    speed: f32,
    gridSpacing: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vectors: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================
fn init(idx: u32) {
    let GRID_SIZE = 10u;
    
    // Reverse-map the 1D thread index to 3D grid coordinates 
    // This matches the specific layout of your original TS loop
    let z = f32(idx % GRID_SIZE);
    let y = f32((idx / GRID_SIZE) % GRID_SIZE);
    let x = f32(idx / (GRID_SIZE * GRID_SIZE));

    let offset = (f32(GRID_SIZE) - 1.0) * params.gridSpacing / 2.0;

    let pos_x = (x * params.gridSpacing) - offset;
    let pos_y = (y * params.gridSpacing) - offset;
    let pos_z = (z * params.gridSpacing) - offset;

    positions[idx] = vec4<f32>(pos_x, pos_y, pos_z, 1.0);
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&positions)) { return; }

    // Intercept for initialization pass
    if (params.time == 0.0) {
        init(idx);
        return;
    }

    // Fetch the grid point position
    let pos = positions[idx].xyz;
    let t = params.time * params.speed;

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