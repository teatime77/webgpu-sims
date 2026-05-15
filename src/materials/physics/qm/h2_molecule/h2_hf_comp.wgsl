// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: h2_hf_comp
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    orbitalType: f32,
    bondLength: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> rng: array<u32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

// PCG Random Number Generator
fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_f32(idx: u32) -> f32 {
    rng[idx] = pcg_hash(rng[idx]);
    return f32(rng[idx]) / f32(0xffffffffu);
}

// LCAO Probability Density |ψ|^2 for H2
fn get_density(pos: vec3<f32>) -> f32 {
    let half_d = params.bondLength * 0.5;
    
    // Position of Nucleus A and Nucleus B along the X-axis
    let nucleus_A = vec3<f32>(-half_d, 0.0, 0.0);
    let nucleus_B = vec3<f32>(half_d, 0.0, 0.0);
    
    // Distances from the electron position to each nucleus
    let rA = length(pos - nucleus_A);
    let rB = length(pos - nucleus_B);
    
    // 1s Slater-Type Orbitals (approximate)
    let psi_A = exp(-rA);
    let psi_B = exp(-rB);
    
    var psi = 0.0;
    if (params.orbitalType < 0.5) {
        // Bonding Orbital (σg) : Constructive interference
        psi = psi_A + psi_B;
    } else {
        // Antibonding Orbital (σu*) : Destructive interference
        psi = psi_A - psi_B;
    }
    
    // Probability density is the square of the wavefunction
    return psi * psi;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&particles)) { return; }

    // If reset flag is triggered by UI change, scatter particles uniformly in a box
    if (params.resetFlag > 0.5) {
        let rx = (rand_f32(idx) - 0.5) * 15.0;
        let ry = (rand_f32(idx) - 0.5) * 15.0;
        let rz = (rand_f32(idx) - 0.5) * 15.0;
        particles[idx] = vec4<f32>(rx, ry, rz, 1.0);
        return;
    }

    // --- Metropolis-Hastings MCMC Step ---
    let current_pos = particles[idx].xyz;
    let p_current = get_density(current_pos);

    // Random walk proposal
    let step = params.samplingStep * 3.0;
    let proposal = current_pos + vec3<f32>(
        (rand_f32(idx) - 0.5) * step,
        (rand_f32(idx) - 0.5) * step,
        (rand_f32(idx) - 0.5) * step
    );

    let p_proposal = get_density(proposal);

    // Accept or reject the proposed step
    if (p_proposal > p_current || rand_f32(idx) < (p_proposal / p_current)) {
        particles[idx] = vec4<f32>(proposal, 1.0);
    }
}