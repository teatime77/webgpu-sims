// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: h2_hf_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    orbitalType: f32,
    bondLength: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: ParamsStruct;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    let pos = particles[v_idx].xyz;
    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);

    // We recalculate the wavefunction phase (sign) to color the orbital lobes
    let half_d = params.bondLength * 0.5;
    let rA = length(pos - vec3<f32>(-half_d, 0.0, 0.0));
    let rB = length(pos - vec3<f32>(half_d, 0.0, 0.0));
    
    let psi_A = exp(-rA);
    let psi_B = exp(-rB);
    
    var psi = 0.0;
    if (params.orbitalType < 0.5) {
        psi = psi_A + psi_B;
    } else {
        psi = psi_A - psi_B;
    }

    // Map the Quantum Phase to Colors
    let colorPositive = vec3<f32>(0.2, 0.6, 1.0); // Cyan/Blue for + Phase
    let colorNegative = vec3<f32>(1.0, 0.3, 0.1); // Orange/Red for - Phase
    
    var baseColor = colorPositive;
    if (psi < 0.0) {
        baseColor = colorNegative;
    }

    // Blend slightly towards white based on colorMix to simulate core density glow
    let finalColor = mix(baseColor, vec3<f32>(1.0, 1.0, 1.0), params.colorMix * 0.3);

    out.color = vec4<f32>(finalColor * params.brightness, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color; // Standard additive point rendering
}