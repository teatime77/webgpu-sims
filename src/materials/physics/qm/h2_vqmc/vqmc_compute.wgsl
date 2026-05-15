// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: vqmc_compute
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    spinState: f32,
    bondLength: f32,
    jastrow: f32,
    pinX: f32,
    pinY: f32,
    pinZ: f32,
    samplingStep: f32,
    brightness: f32,
    resetFlag: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> e1_pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> e2_pos: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> rng: array<u32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
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

// Full 6D Many-Body Probability Density
fn get_density(r1: vec3<f32>, r2: vec3<f32>) -> f32 {
    let half_d = params.bondLength * 0.5;
    let nuc_A = vec3<f32>(-half_d, 0.0, 0.0);
    let nuc_B = vec3<f32>(half_d, 0.0, 0.0);

    // Evaluate 1s atomic orbitals for both electrons at both nuclei
    let psiA_1 = exp(-length(r1 - nuc_A));
    let psiB_1 = exp(-length(r1 - nuc_B));
    let psiA_2 = exp(-length(r2 - nuc_A));
    let psiB_2 = exp(-length(r2 - nuc_B));

    var psi_slater = 0.0;
    
    if (params.spinState < 0.5) {
        // Singlet State (Symmetric Spatial Wavefunction)
        // Electrons have opposite spins, so they are allowed to share the bonding orbital.
        let bond_1 = psiA_1 + psiB_1;
        let bond_2 = psiA_2 + psiB_2;
        psi_slater = bond_1 * bond_2;
    } else {
        // Triplet State (Antisymmetric Spatial Wavefunction)
        // Electrons have the same spin. The Pauli Principle demands antisymmetry!
        // We enforce this using a 2x2 Slater Determinant: Det([A1 B1], [A2 B2])
        psi_slater = (psiA_1 * psiB_2) - (psiB_1 * psiA_2);
    }

    // Jastrow Factor (Explicit Electron Correlation)
    // Electrons repel each other electrostatically. This function lowers the probability
    // drastically when the distance between the two electrons (r12) gets close to 0.
    let r12 = length(r1 - r2);
    let jastrow = exp((params.jastrow * r12) / (1.0 + 0.5 * r12));

    let psi_total = psi_slater * jastrow;
    
    // Born rule
    return psi_total * psi_total;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&e1_pos)) { return; }

    // Burn-in / Reset
    if (params.resetFlag > 0.5) {
        e1_pos[idx] = vec4<f32>((rand_f32(idx) - 0.5) * 10.0, (rand_f32(idx) - 0.5) * 10.0, (rand_f32(idx) - 0.5) * 10.0, 1.0);
        e2_pos[idx] = vec4<f32>((rand_f32(idx) - 0.5) * 10.0, (rand_f32(idx) - 0.5) * 10.0, (rand_f32(idx) - 0.5) * 10.0, 1.0);
        return;
    }

    // --- 6D Metropolis-Hastings MCMC Step ---
    let curr_r1 = e1_pos[idx].xyz;
    let curr_r2 = e2_pos[idx].xyz;
    
    // Ensure probability never mathematically hits 0.0
    let p_curr = max(get_density(curr_r1, curr_r2), 1e-30);

    let step = params.samplingStep * 3.0;
    
    let prop_r1 = curr_r1 + vec3<f32>(rand_f32(idx)-0.5, rand_f32(idx)-0.5, rand_f32(idx)-0.5) * step;
    let prop_r2 = curr_r2 + vec3<f32>(rand_f32(idx)-0.5, rand_f32(idx)-0.5, rand_f32(idx)-0.5) * step;

    // Ensure proposal never hits 0.0
    let p_prop = max(get_density(prop_r1, prop_r2), 1e-30);

    if (p_prop > p_curr || rand_f32(idx) < (p_prop / p_curr)) {
        e1_pos[idx] = vec4<f32>(prop_r1, 1.0);
        e2_pos[idx] = vec4<f32>(prop_r2, 1.0);
    }
}