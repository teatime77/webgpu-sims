// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: string_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    time: f32,
    amplitude: f32,
    frequency: f32,
    speed: f32,
    segmentLength: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> directions: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let num_segments = arrayLength(&positions);
    if (idx >= num_segments) { return; }

    let x = (f32(idx) - f32(num_segments) / 2.0) * params.segmentLength;

    if (params.time == 0.0) {
        positions[idx] = vec4<f32>(x, 0.0, 0.0, 1.0);
        directions[idx] = vec4<f32>(1.0, 0.0, 0.0, params.segmentLength);
        return;
    }

    // 1. Calculate EXACT position of the CURRENT point
    let phase_current = x * params.frequency - params.time * params.speed * 5.0; 
    let y_current = params.amplitude * sin(phase_current);
    
    // 2. Calculate EXACT position of the NEXT point
    let x_next = x + params.segmentLength;
    let phase_next = x_next * params.frequency - params.time * params.speed * 5.0;
    let y_next = params.amplitude * sin(phase_next);
    
    // 3. Create a vector that connects point A perfectly to point B
    let delta_x = params.segmentLength;
    let delta_y = y_next - y_current;
    let secant_vector = vec3<f32>(delta_x, delta_y, 0.0);
    
    // 4. Calculate the exact stretch distance to reach the next point
    let stretch = length(secant_vector);
    let dir = secant_vector / stretch; // Normalized direction

    positions[idx] = vec4<f32>(x, y_current, 0.0, 1.0);
    
    // Pack direction and stretch into one vec4
    directions[idx] = vec4<f32>(dir, stretch); 
}