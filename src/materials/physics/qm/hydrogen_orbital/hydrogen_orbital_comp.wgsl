// src/materials/physics/qm/hydrogen_orbital/hydrogen_orbital_comp.wgsl

struct Params {
    orbitalMode: f32,
    samplingStep: f32,
    brightness: f32,
    colorMix: f32,
    resetFlag: f32,
    pad1: f32, // 16バイト境界に合わせるためのパディング
    pad2: f32,
    pad3: f32,
};
@group(0) @binding(0) var<uniform> params: Params;

struct Particle {
    pos: vec4<f32>, // pos.w は未使用
};
// 1,000,000個のパーティクル位置を保持するストレージバッファ
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

// 乱数生成用の状態バッファ
@group(0) @binding(2) var<storage, read_write> rngState: array<u32>;

// PCG乱数生成器
fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_f32(idx: u32) -> f32 {
    let hash = pcg_hash(rngState[idx]);
    rngState[idx] = hash;
    return f32(hash) / f32(0xffffffffu);
}

// 確率密度関数 psi_sq = |psi|^2
fn orbital_density(mode: i32, p: vec3<f32>) -> f32 {
    let r = max(length(p), 1e-5);
    let ct = p.z / r;
    let cos_theta = clamp(ct, -1.0, 1.0);
    let pi = 3.14159265359;
    
    var psi = 0.0;
    if (mode == 0) { // 1s
        psi = (1.0 / sqrt(pi)) * exp(-r);
    } else if (mode == 1) { // 2p_z
        psi = (1.0 / (4.0 * sqrt(2.0 * pi))) * r * exp(-0.5 * r) * cos_theta;
    } else { // 3d_z2
        psi = (1.0 / (81.0 * sqrt(6.0 * pi))) * r * r * exp(-r / 3.0) * (3.0 * cos_theta * cos_theta - 1.0);
    }
    return psi * psi;
}

// メトロポリス・ヘイスティングス法によるサンプリング
@compute @workgroup_size(64)
fn main_compute(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&particles)) { return; }

    // リセットフラグが立っている場合、現在の位置を無視してランダムに飛ぶ
    if (params.resetFlag > 0.5) {
        let rx = (rand_f32(idx) - 0.5) * 15.0;
        let ry = (rand_f32(idx) - 0.5) * 15.0;
        let rz = (rand_f32(idx) - 0.5) * 15.0;
        particles[idx].pos = vec4<f32>(rx, ry, rz, 1.0);
        return; 
    }
    
    let mode = i32(round(params.orbitalMode));
    
    // 現在の位置
    var current_pos = particles[idx].pos.xyz;
    if (length(current_pos) > 10.0 || length(current_pos) < 1e-5) {
        current_pos = vec3<f32>(rand_f32(idx), rand_f32(idx), rand_f32(idx)) * 2.0 - 1.0;
    }
    
    // 現在の確率密度
    let current_p = orbital_density(mode, current_pos);
    
    // 候補点の生成（乱数移動）
    let step = params.samplingStep;
    let proposed_pos = current_pos + vec3<f32>(
        rand_f32(idx) * 2.0 - 1.0,
        rand_f32(idx) * 2.0 - 1.0,
        rand_f32(idx) * 2.0 - 1.0
    ) * step;
    
    // 候補点の確率密度
    let proposed_p = orbital_density(mode, proposed_pos);
    
    // 受容確率の計算 A = min(1, p_proposed / p_current)
    var accept_ratio = 1.0;
    if (current_p > 1e-18) {
        accept_ratio = clamp(proposed_p / current_p, 0.0, 1.0);
    }
    
    // 候補点を受容するか判定
    if (rand_f32(idx) < accept_ratio) {
        particles[idx].pos = vec4<f32>(proposed_pos, 1.0);
    } else {
        particles[idx].pos = vec4<f32>(current_pos, 1.0);
    }
}