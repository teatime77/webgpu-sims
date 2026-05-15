// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: wave_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    time: f32,
    speed: f32,
    amplitude: f32,
    frequency: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> baseGrid: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> normals: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================
fn init(idx: u32) {
    let GRID_SIZE = 200u;
    
    // 6 vertices per grid cell (2 triangles)
    let cell_idx = idx / 6u; 
    let vertex_in_cell = idx % 6u;

    // Map 1D cell index to 2D grid coordinates
    let grid_x = f32(cell_idx % GRID_SIZE);
    let grid_z = f32(cell_idx / GRID_SIZE);

    let size = 20.0;
    let halfSize = size / 2.0;
    let step_size = size / f32(GRID_SIZE);

    // Calculate the 4 corners of the current grid cell
    let x0 = grid_x * step_size - halfSize;
    let z0 = grid_z * step_size - halfSize;
    let x1 = (grid_x + 1.0) * step_size - halfSize;
    let z1 = (grid_z + 1.0) * step_size - halfSize;

    var pos: vec4<f32>;

    // Assign the correct vertex coordinate based on the position in the 6-vertex sequence
    if (vertex_in_cell == 0u) { pos = vec4<f32>(x0, 0.0, z0, 1.0); }      // Triangle 1: Bottom-Left
    else if (vertex_in_cell == 1u) { pos = vec4<f32>(x1, 0.0, z0, 1.0); } // Triangle 1: Bottom-Right
    else if (vertex_in_cell == 2u) { pos = vec4<f32>(x0, 0.0, z1, 1.0); } // Triangle 1: Top-Left
    else if (vertex_in_cell == 3u) { pos = vec4<f32>(x1, 0.0, z0, 1.0); } // Triangle 2: Bottom-Right
    else if (vertex_in_cell == 4u) { pos = vec4<f32>(x1, 0.0, z1, 1.0); } // Triangle 2: Top-Right
    else { pos = vec4<f32>(x0, 0.0, z1, 1.0); }                           // Triangle 2: Top-Left (vertex_in_cell == 5u)

    baseGrid[idx] = pos;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&baseGrid)) { return; }

    // Intercept for initialization pass
    if (params.time == 0.0) {
        init(idx);
        return;
    }

    // Read the static flat plane coordinate
    let base_pos = baseGrid[idx].xyz;
    let x = base_pos.x;
    let z = base_pos.z;

    let A = params.amplitude;
    let F = params.frequency;
    let T = params.time * params.speed;

    // --- Wave 1: Traveling along the X axis ---
    let w1_phase = x * F + T;
    let y1 = sin(w1_phase);
    // Partial derivatives for Wave 1
    let dy1_dx = F * cos(w1_phase);
    let dy1_dz = 0.0;

    // --- Wave 2: Traveling diagonally ---
    // (0.5, 0.866) is a normalized direction vector for 60 degrees
    let dir_x = 0.5;
    let dir_z = 0.866;
    let w2_phase = (x * dir_x + z * dir_z) * F + T * 1.3;
    let y2 = sin(w2_phase);
    // Partial derivatives for Wave 2
    let dy2_dx = dir_x * F * cos(w2_phase);
    let dy2_dz = dir_z * F * cos(w2_phase);

    // --- Combine Waves ---
    // Average the heights and derivatives, then scale by amplitude
    let y = A * (y1 + y2) * 0.5;
    let dy_dx = A * (dy1_dx + dy2_dx) * 0.5;
    let dy_dz = A * (dy1_dz + dy2_dz) * 0.5;

    // Write the new dynamic position
    positions[idx] = vec4<f32>(x, y, z, 1.0);

    // --- Calculate the exact Mathematical Normal ---
    // Tangent vector in X direction: T_x = (1, dy_dx, 0)
    // Tangent vector in Z direction: T_z = (0, dy_dz, 1)
    // Normal = Cross Product of T_z and T_x = (-dy_dx, 1.0, -dy_dz)
    let normal = normalize(vec3<f32>(-dy_dx, 1.0, -dy_dz));
    
    // Write the normal
    normals[idx] = vec4<f32>(normal, 0.0);
}