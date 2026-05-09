// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: hydrogen_orbital_comp
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct ParamsStruct {
    orbitalMode: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> rng: array<u32>;

// --- YOUR COMPUTE LOGIC BELOW ---

// PCG 乱数ジェネレータ
fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_f32(idx: u32) -> f32 {
    rng[idx] = pcg_hash(rng[idx]);
    return f32(rng[idx]) / f32(0xffffffffu);
}

// 波動関数の確率密度 |ψ|^2
fn get_density(pos: vec3<f32>) -> f32 {
    let r = length(pos);
    let z = pos.z;
    let mode = i32(params.orbitalMode + 0.5);

    if (mode == 0) { // 1s
        return exp(-2.0 * r);
    } else if (mode == 1) { // 2p_z
        return pow(r * exp(-0.5 * r) * (z / r), 2.0);
    } else if (mode == 2) { // 3d_z2
        let costheta = z / r;
        return pow(pow(r, 2.0) * exp(-r / 3.0) * (3.0 * pow(costheta, 2.0) - 1.0), 2.0);
    }
    return 0.0;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&particles)) { return; }

    // ★ リセットフラグが立っている場合、空間全体にランダムに散布（グローバル・ジャンプ）
    if (params.resetFlag > 0.5) {
        let rx = (rand_f32(idx) - 0.5) * 30.0;
        let ry = (rand_f32(idx) - 0.5) * 30.0;
        let rz = (rand_f32(idx) - 0.5) * 30.0;
        particles[idx] = vec4<f32>(rx, ry, rz, 1.0);
        return;
    }

    // --- メトロポリス・ヘイスティングス法 ---
    let current_pos = particles[idx].xyz;
    let p_current = get_density(current_pos);

    // 周辺へのランダムな移動提案
    let step = params.samplingStep * 5.0;
    let proposal = current_pos + vec3<f32>(
        (rand_f32(idx) - 0.5) * step,
        (rand_f32(idx) - 0.5) * step,
        (rand_f32(idx) - 0.5) * step
    );

    let p_proposal = get_density(proposal);

    // 受理判定
    if (p_proposal > p_current || rand_f32(idx) < (p_proposal / p_current)) {
        particles[idx] = vec4<f32>(proposal, 1.0);
    }
}