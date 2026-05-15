// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: pendulum_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    baseLength: f32,
    bobRadius: f32,
    stringThickness: f32,
    time: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> stateBuffer: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let num_pendulums = arrayLength(&stateBuffer);
    if (idx >= num_pendulums) { return; }

    // --- GPU Initialization ---
    if (params.time == 0.0) {
        // Space them out along the Z-axis
        let z_spacing = 1.0;
        let z_offset = (f32(idx) - f32(num_pendulums) / 2.0) * z_spacing;
        
        // Pendulum wave magic: calculate lengths so frequencies form a pattern.
        // We want pendulum N to perform exactly N more swings than pendulum 0 over a specific time.
        // T = 2 * PI * sqrt(L / g) => f = (1 / 2*PI) * sqrt(g / L)
        // For simplicity here, we decrease the length proportionally.
        let frequency_factor = 1.0 + f32(idx) * 0.05;
        let L = params.baseLength / (frequency_factor * frequency_factor);
        
        // Initial state: theta (angle), omega (angular velocity), z_offset, length
        let initial_theta = 0.5; // ~28 degrees
        let initial_omega = 0.0;
        
        stateBuffer[idx] = vec4<f32>(initial_theta, initial_omega, z_offset, L);
        return;
    }

    // --- Physics Integration ---
    var state = stateBuffer[idx];
    let theta = state.x;
    var omega = state.y;
    let z_offset = state.z;
    let L = state.w;

    // Equation of motion: angular acceleration (alpha) = -(g / L) * sin(theta)
    let alpha = -(params.gravity / L) * sin(theta);
    
    // Semi-Implicit Euler integration (update velocity first, then position for better stability)
    omega += alpha * params.dt;
    let new_theta = theta + omega * params.dt;

    // Write back state
    stateBuffer[idx] = vec4<f32>(new_theta, omega, z_offset, L);
}