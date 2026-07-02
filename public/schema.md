# WebGPU Simulation Architecture Overview

This architecture is a framework designed to integrate TypeScript, WebGPU, and WGSL for running highly efficient and safe physical simulations and graphics rendering directly in the browser.

The fundamental design philosophy is **the strict separation of the simulation's "blueprint" (a declarative schema) from its "orchestration" (procedural execution flow)**. By representing the entire pipeline through pure TypeScript objects and WebGPU execution functions, the architecture ensures maximum transparency, maintainability, and control over complex GPU calculations.

---

### Human-AI Collaboration Workflow

This application relies on a strict ping-pong workflow between the Human User and the AI Assistant (you). To maintain synchronization, always await the user's explicit prompt for your specific step.

Here is the exact sequence of operations:

1. **Context Initialization (Human ➡️ AI):** The human user provides this architectural document to you. This establishes the baseline rules and constraints. *AI Action: Acknowledge understanding and wait.*
2. **Schema Generation (Human ➡️ AI):** The human provides a conceptual overview of the desired physical simulation. *AI Action: Generate the strictly formatted `SimulationSchema` (TypeScript) based on the provided physics and constraints. Do not write WGSL code yet.*
3. **Skeleton Generation (Human App):** The human copies your generated schema into the application. The application automatically parses the TypeScript and generates a foundational WGSL skeleton containing all necessary structs and resource bindings.
4. **Logic Implementation (Human ➡️ AI):** The human provides you with the auto-generated WGSL skeleton. *AI Action: Implement the core mathematical and physical logic exclusively within the designated `main`, `vs_main`, or `fs_main` functions. Do not alter the skeleton's bindings, struct names, or layout.*
5. **Execution (Human App):** The human copies your finalized WGSL code back into the application and runs the live physical simulation.

---

## Schema Structure

This schema strictly separates state, memory allocation (resources), pipeline execution (shaders), user interface (UIs) and script.

## 1. Global State and Constants

Before defining the schema object, declare the simulation parameters and constants.

* **`state` Object:** A plain JavaScript object holding the mutable physics parameters (e.g., `brightness`, `scale`). This object will be referenced by both the Uniform buffers and the UI components.
* **Constants:** Define configuration constants like `NUM_PENDULUMS`, `SPHERE_DIVISION` and `gravitational constant`.  
**Strict Requirement:** You **MUST** define the initial camera distance constant from the origin as `InitialCameraDistance` so that the entire 3D view is visible.  
The fovy(Vertical field of view in radians) is $\pi / 4$.  
The pitch is normally $\pi / 3$ , but it is $\pi / 2$ when `shadingModel` is `scalar-grid`.

---

## 2. Schema Object

The `SimulationSchema` is a root object containing the following primary keys: `name`, `resources`, `shaders`, `uis` and `script`.

### A. `resources` (Object / The Memory Pool)

The `resources` field is a **Key-Value Dictionary (Object)**. Order does not matter. It acts as a centralized registry for all WebGPU buffers, uniforms, and meshes.

**Resource Types:**

There are four types of resources:

1. `uniform`
WebGPU uniform variables.
2. `storage`
WGSL uses these to read and write data for mathematical and physical calculations.
They output the position and color of shapes and are also used as instance data for the render pipeline.
3. `mesh`
Mesh data such as the vertex positions and normals of primitive shapes like spheres, cylinders, and arrows.
4. `readback`
A staging buffer for copying WGSL calculation results to a TypeScript Float32Array.

#### **1. uniform**
* Format:
```js
{ 
    type: "uniform", 
    obj: [Reference to state object] 
}
```

If the name of the uniform variable is `Params` and the object pointed to by `obj` has `time` property , the app sets the elapsed time to `time`.

The elapsed time is in seconds, and the value of `time` is 0 on the first shader call.

Compute shaders can perform initialization when the value of `time` is 0.

#### **2. storage**
* Format:
```typescript
{
    type: "storage",
    format: "f32" | "u32" | "i32" | "vec2<f32>" | "vec3<f32>" | "vec4<f32>" | "mat4x4<f32>", 
    count: number, 
    meshRef?: string, 
    topology?: "point-list" | "line-list" | "triangle-list", 
    shadingModel?: "triangle-color" | "vertex-color" | "vertex-color-normal" | "scalar-grid",
    canvasId? : string
}
```

**Storage Buffer Rendering Modes:**
Depending on how the storage buffer is visualized, it must adhere to one of the following architectural patterns:

**1. Mesh Instancing**
If the buffer drives a 3D mesh (like a sphere or tube), include `meshRef`.
* `meshRef` (must match a key in the `resources` object).

**2. Procedural Topologies**
If the buffer generates procedural geometry without a mesh, specify a `topology`. The memory layout (stride) must strictly match the rules below to ensure the WebGPU vertex puller calculates offsets correctly. 

* `topology: "point-list"`
  * **Intent:** Draws 1-pixel points (e.g., massive particle swarms). 
  * **Memory Stride:** 8 floats per point `[x, y, z, pad, r, g, b, a]`.
  * **Count Calculation:** `NUM_POINTS * 8`

* `topology: "line-list"`
  * **Intent:** Draws 1-pixel line segments (e.g., vector fields, trails). 
  * **Memory Stride:** 12 floats per line `[pivot.x, pivot.y, pivot.z, vector.x, vector.y, vector.z, radius, pad, r, g, b, a]`.
  * **Count Calculation:** `NUM_LINES * 12`

* `topology: "triangle-list"`
  * **Intent:** Draws custom 3D surfaces (e.g., fluid grids, cloth, terrain).
  * **Requirement:** Must include a `shadingModel` to instruct the framework on how to unpack the memory and calculate normals. Supported shading models:
    * `"triangle-color"`: Processes per-triangle. Flat color per face.
      * **Memory Stride:** 13 floats per TRIANGLE `[x1, y1, z1, x2, y2, z2, x3, y3, z3, r, g, b, a]`.
      * **Count Calculation:** `NUM_TRIANGLES * 13`
    * `"vertex-color"`: Processes per-vertex. Colors interpolate smoothly. Flat normals are calculated dynamically in the fragment shader via `dpdx/dpdy`.
      * **Memory Stride:** 7 floats per VERTEX `[x, y, z, r, g, b, a]`.
      * **Count Calculation:** `NUM_VERTICES * 7`
    * `"vertex-color-normal"`: Processes per-vertex. Perfect smooth shading using explicit pre-calculated normals.
      * **Memory Stride:** 10 floats per VERTEX `[x, y, z, r, g, b, a, nx, ny, nz]`.
      * **Count Calculation:** `NUM_VERTICES * 10`
    * `scalar-grid`: Processes a 1D array of scalars into a 2D full-screen grid visualization.  
    This heavily optimizes memory bandwidth by bypassing 3D vertex math entirely, utilizing a single procedural full-screen triangle.  
        * **Memory Stride:** 1 float per GRID CELL [value].  
        * **Count Calculation:**  GRID_WIDTH * GRID_HEIGHT



#### **3. mesh**
* Format:
```js
{ 
    type: "mesh", 
    shape: '[tube|cylinder|arrow|sphere]', 
    division: [Number] 
}
```

The average division values ​​for each type are as follows:
* tube : 16
* cylinder : 16
* arrow : 16
* sphere : 2

#### **4. readback**
* Format:
```js
{ 
    type: "readback", 
    format: [struct name], 
}
```

Keys of `storage` and `readback` resources are used `copy` instruction in the script(described later).

The following script copies the contents of storageB to readbackC after shaderA has been executed.
```js
const schema = {
    // ...
    script: ()=>{
        execute(shaderA);
        copy(storageB, readbackC);
    }
};
```

#### canvasId (optional)

By default, the app draws on the main canvas, but you can also draw on the other canvas as specified in `Section D. Additional Canvases` (described later).

*AI Generation Rule:* Use exact object keys as the resource IDs. Ensure no duplicate keys exist.

### B. `shaders` (Array / The Execution Pipeline)

The `shaders` field is an **Array of Objects**. Order **strictly matters**. This represents the chronological sequence of compute or render passes.

**Shader Pass Properties:**

* `id`: A unique string identifier for the shader pass (e.g., `"pendulum_comp"`).
* `type`: The type of pass (e.g., `"compute"`).
* `workgroupSize`: Integer representing local invocation size (e.g., `64`).
* `workgroupCount`: Total dispatches (usually calculated via constants).
* `bindings`: An array mapping the previously defined `resources` to WGSL variables. Each binding object supports the following properties:
    * `resource` (Required): Must exactly match a key defined in the `resources` object.
    * `group` (Optional): Explicitly defines the `@group(X)` index in WGSL. (Defaults to `0`).
    * `binding` (Optional): Explicitly defines the `@binding(X)` index in WGSL.
    * `varName` (Optional): The variable name to be injected into the auto-generated WGSL skeleton.
    * `access` (Optional): Set to `"read_write"` for mutable storage buffers.

---

### C. `uis` (Array / The User Interface)

The `uis` field is an **Array of Objects** that instructs the frontend on how to build the control panel. It directly binds interactive HTML elements to the mutable global `state` object.

When generating UI components, the AI must strictly adhere to one of the following component definitions based on the `type` property.

#### Common Properties (Required for all UI components)

* `type`: The specific UI control to render (`"range"` or `"select"`).
* `obj`: Must reference the global `state` object.
* `name`: The exact string key within the `state` object that this UI element will mutate.
* `label`: Human-readable display text for the interface.

#### 1. Range Component (`type: "range"`)

Renders an HTML `<input type="range" />` slider. Use this for continuous numeric adjustments.

* **Specific Properties:**
* `min` (Number): The minimum allowed value.
* `max` (Number): The maximum allowed value.
* `step` (Number): The increment step size.

* **Example:**
```javascript
{ 
    type: "range", 
    obj: state, 
    name: "gravity", 
    label: "Gravity", 
    min: 1.0, 
    max: 20.0, 
    step: 0.1 
}
```

#### 2. Select Component (`type: "select"`)

Renders an HTML `<select>` dropdown menu. Use this for switching between discrete states or mathematical modes.

* **Specific Properties:**
* `options` (Array): An array of objects defining the dropdown choices. Each object must strictly contain:
* `value` (Number): The numeric value assigned to the state variable when this option is selected.
* `text` (String): The human-readable label for the `<option>` tag.


* **Example:**
```javascript
{ 
    type: "select", 
    obj: state, 
    name: "orbitalMode", 
    label: "Orbital",
    options: [
        { value: 0, text: "1s (spherical)" },
        { value: 1, text: "2p_z (dumbbell)" },
        { value: 2, text: "3d_z2 (donut+lobes)" }
    ]
}
```

#### 3. Label Component (`type: "label"`)

Renders an span HTML. 
Use this to show the result value calculated by the shader.

* **Specific Properties:**
* `name` (string): The field name in the struct declaration.
* `label`(string):Human-readable display text.
* `resource`(string): The key of the `readback` resource.
* `decimalPlaces` (number): number of decimal places 

* **Example:**
```javascript
{ 
    type: "label", 
    name:"result", 
    label:"result value", 
    resource:"Readback", 
    decimalPlaces:3 
}
```


### D. `structs` (optional)

`structs` is used when copying WGSL calculation results to a TypeScript Float32Array using the `readback` resource.

In the following example, after executing `calculator`, `Result` is copied to `Readback`, and `result` value in `Readback` is displayed in a `label`.
#### Example:
```js
const schema = {
    // ...
    structs: `
        struct ResultStruct {
            result: f32,
        };
    `
    ,
    resources: {
        Result: { type:'storage', format: 'ResultStruct', count:1 },
        Readback: { type:'readback', format: 'ResultStruct' }
    }
    ,
    shaders: [
        {
            id: 'calculator',
            type: 'compute',
            // ...
            bindings: [
                { resource: 'Result', access: 'read_write' },
            ]
        }
    ]
    ,
    script: ()=>{
        execute(calculator);
        copy(Result, Readback);
    }
    ,
    uis:[
        { type: "label", name:"result", label:"calculation result", resource:"Readback", decimalPlaces:3 },
    ]
};
```

The app generates a WGSL skeleton like the one below.
```wgsl
struct ResultStruct {
    result: f32,
};

@group(0) @binding(0) var<storage, read_write> Result: ResultStruct;
```


### E. Additional `canvases` (optional)

By default, the app draws on the main canvas, but you can also draw on multiple additional canvases.

* **Canvas Properties:**
* `id` (string): The minimum allowed value.
* `width` (number): width of HTMLCanvasElement.
* `height` (number): height of HTMLCanvasElement.

#### Example:
```js
const schema = {
    // ...
    canvases: [
        { id: "another-canvas", width: 800, height: 600 }
    ]
    // ...
};
```

### F. `script` (optional)

By default, the shaders in `shaders` are executed sequentially once each time a frame is rendered.

The `script` property provides a custom execution environment to orchestrate complex computational flows (like iterative solvers or leapfrog integration). The script interpreter supports the following capabilities:

* **Loops:** Control executions using `for` (over arrays/ranges) and `while` loops.
* **Conditionals:** Change the execution path using `if/else` statements referencing uniform variable states.
* **Uniform Assignment:** Mutate global uniform state directly.
* **Resource Swapping:** Pass a secondary overrides object to `execute(shader, overrides)` to dynamically swap bound uniform or storage buffers without triggering pipeline stalls.
* **Asynchronous Pausing:** Use the `yield` keyword immediately after a `copy()` statement. This safely pauses the script's execution to wait for the GPU memory to map back to the CPU (e.g., reading a residual calculation) without blocking the browser's main render thread.

The script interpreter has a strict, minimalist feature set. The following features are **not** available:

* Traditional `for` loops with termination conditions (e.g., `for(let i = 0; i < 2; i++)`). Use `for (const i of range(N))` instead.
* `switch` statements.

#### Example: Dynamic Swapping and Convergence Loops

```javascript
const state_Hold = { eps: 0.0 };
const state_Hhalf = { eps: 0.005 };

const schema = {
    // ...
    resources: {
        Params:      { type: 'uniform', obj: state_Hold },
        Params_Half: { type: 'uniform', obj: state_Hhalf },
        Result:      { type: 'storage', format: 'ResultStruct', count: 1 },
        Readback:    { type: 'readback', format: 'ResultStruct' }
    },
    // ...
    script: () => {
        // 1. Execute using an overridden BindGroup (Swaps Params for Params_Half)
        execute(shaderInit, { Params: "Params_Half" });

        // 2. Initial batch of work
        for (const i of range(20)) {
            execute(shaderSolver);
        }
        
        // 3. Copy results and yield to await the GPU readback
        copy(Result, Readback);
        yield;

        // 4. Convergence Loop using the mapped Readback data
        while (Readback.rho > 1e-12) {
            for (const i of range(20)) {
                execute(shaderSolver);
            }
            copy(Result, Readback);
            yield; // Pause again to safely fetch the new rho
        }
    }
};
```

## Example Output Validation

When generating this schema, ensure that:

1. Every `resource` referenced in `shaders[].bindings` exists in the `resources` object.
2. Every `meshRef` referenced in a storage buffer exists as a `type: "mesh"` resource.
3. Every `name` referenced in the `uis` array exists in the `state` object.
4. `InitialCameraDistance` is defined in the global constants.

## 3. Common WebGPU Gotchas & Best Practices

When implementing the TypeScript schema or WGSL logic, you MUST adhere to the following rules to prevent pipeline validation crashes and silent GPU failures:

### A. Dead-Code Elimination (The Binding Mismatch Trap)
**The Problem:** The WGSL compiler aggressively optimizes code. If you declare a binding in the TypeScript schema (e.g., passing a `Params` uniform to a render pass) but **never read from it** inside `vs_main` or `fs_main`, the compiler strips the binding entirely. WebGPU will then throw a `BindGroupLayout` validation error because the TS engine expects the binding to exist, but the compiled shader lacks it.
**The Rule:** Only bind resources in the `SimulationSchema` that are explicitly necessary for the shader's logic. If you change a shader's logic and stop using a buffer, you MUST remove that binding from the TypeScript schema and regenerate the skeleton.

### B. Safe Vertex Culling in Render Passes
**The Problem:** When you want to dynamically hide/cull a vertex (e.g., conditionally hiding particles), setting `out.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);` causes a divide-by-zero error during the perspective divide. Some GPU drivers handle this silently, but others (like WebKit or certain Windows drivers) will panic and render a completely black screen.
**The Rule:** To cull a vertex safely, move it outside the visible clip space box using `W = 1.0`. 
* **Correct:** `out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);`

### C. Floating Point Underflow & Division by Zero
**The Problem:** In Monte Carlo simulations or physics equations, probabilities and distances can get extremely small, underflowing to exactly `0.0`. If this value is used in a division (e.g., `p_proposal / p_current`), it results in `NaN`, freezing the particle in place or blacking out the screen.
**The Rule:** Always guard divisions involving calculated densities or distances. Use `max(value, 1e-30)` to ensure denominators never hit absolute zero.

### D. The Storage Buffer Pointer Trap
**The Problem:** While the WGSL specification theoretically allows passing pointers to storage arrays into helper functions (e.g., `buffer: ptr<storage, array<f32>, read_write>`), browser shader compilers (like Chrome's Tint) often struggle to parse the dereferencing syntax `(*buffer)[offset]`. The compiler misinterprets the syntax and throws a fatal parsing error, typically stating: `error: expected "=" for assignment`.
**The Rule:** Do not pass storage buffers as pointers to helper functions. Instead, design your helper functions to directly access the globally scoped storage variables. 
* **Incorrect:** `fn write_data(buffer: ptr<storage, array<f32>, read_write>, idx: u32) { (*buffer)[idx] = 1.0; }`
* **Correct:** `fn write_data(idx: u32) { GlobalBuffer[idx] = 1.0; }` // Accesses the @binding directly

### E. The Underscore Identifier Trap (Discarding Return Values)

**The Problem:** When calling a function solely for its side effects (like warming up a random number generator) and discarding the return value, developers coming from languages like Rust or Swift instinctively write `let _ = function_call();`. However, the WGSL compiler (especially Chrome's Tint) strictly forbids using the underscore `_` as a variable identifier in a `let` declaration. Doing so will immediately trigger a parsing error: `error: expected identifier for 'let' declaration`.
**The Rule:** To discard a return value safely in WGSL, you must either use the "phony assignment" syntax by omitting the `let` keyword entirely, or assign the result to a named dummy variable.

* **Incorrect:** `let _ = rand();`
* **Correct (Phony Assignment):** `_ = rand();`
* **Correct (Named Dummy):** `let dummy = rand();`

Here is the explanation text formatted to drop perfectly into the **"3. Common WebGPU Gotchas & Best Practices"** section of your `schema.md` document.

I have titled it "The TypedArray Readback Trap" and structured it to match the existing format of the document.

---

### F. The TypedArray Readback Trap (Mixed-Type Structs)

**The Problem:** In WebGPU, accumulation counters or precise indices require `u32` to avoid the precision loss that happens with `f32` after reaching 16,777,216. However, when the frontend reads the staging buffer, it typically maps the entire memory pool into a single `Float32Array`. If you try to read a `u32` struct field directly out of that `Float32Array`, JavaScript interprets the raw integer bits as an IEEE 754 floating-point number, resulting in `NaN` or severely corrupted values. Working around this on the CPU side requires cumbersome memory mapping using `DataView` or overlapping `Uint32Array` views.

**The Rule:** Use the **"Dual-Field Casting" (or Shadow Field)** pattern. Keep your `u32` fields in the struct for safe, high-capacity WGSL calculations, but define companion `f32` fields strictly for UI display. Cast the `u32` values to the `f32` display fields at the very end of your compute pipeline. This allows the frontend to safely and lazily read the entire struct from a single `Float32Array`.

* **Example Struct:**

```wgsl
struct ResultStruct {
    piValue: f32,
    
    // Internal WGSL counters (Safe from precision loss)
    totalSamples_calc: u32,
    totalInside_calc: u32,
    
    // Frontend UI display values (Safe to read from Float32Array)
    totalSamples_display: f32,
    totalInside_display: f32,
};

```

* **Example Implementation:**

```wgsl
// 1. Perform safe accumulation using u32
Result.totalSamples_calc += 100000u;
Result.totalInside_calc += frame_inside_count;

// ... other math logic ...

// 2. Cast to f32 right before the shader exits for easy JS readback
Result.totalSamples_display = f32(Result.totalSamples_calc);
Result.totalInside_display = f32(Result.totalInside_calc);

```

---

### G. The Struct Separator Trap (Semicolons vs. Commas)

**The Problem:** Developers coming from C, Rust, or older WGSL drafts instinctively terminate each struct member with a semicolon (e.g., `condensateFraction: f32;`). Early versions of the WGSL specification did use semicolons, and a lot of legacy sample code (and some auto-generated skeletons) still emits them. However, the modern WGSL specification finalized struct members as a **comma-separated list**. When the current Chrome/Tint compiler encounters a semicolon after a member, it expects the struct to be closed and immediately fails with a parsing error: `error: expected '}' for struct declaration`.

**The Rule:** Always separate struct members with commas, exactly like fields in a TypeScript object or arguments in a function call. A trailing comma after the final member is permitted and recommended for clean diffs. Never terminate a member with a semicolon. (Note: the semicolon still correctly terminates the whole `struct {...};` declaration itself — the trap is only about the *separators between members*.)

* **Incorrect (legacy/C-style semicolons):**

```wgsl
struct ResultStruct {
    condensateFraction: f32;
    condensedCount_calc: u32;
    condensedCount_display: f32;
};
```

* **Correct (comma-separated members):**

```wgsl
struct ResultStruct {
    condensateFraction: f32,
    condensedCount_calc: u32,
    condensedCount_display: f32,
};
```

---

# Examples

## 1. Pendulum

### Schema
```jsonet
// UI State
const state = {
    dt: 0.016,
    gravity: 9.81,
    baseLength: 4.0,
    bobRadius: 0.4,
    stringThickness: 0.05,
    time: 0.0,
};

const NUM_PENDULUMS = 10;
const dispatchX = Math.ceil(NUM_PENDULUMS / 64);

const TUBE_DIVISIONS = 16;
const TUBE_STRIDE = 12;
const SPHERE_STRIDE = 8;

const schema: SimulationSchema = {
    name: "Pendulum Wave (Material Architecture)",

    resources: {
        Params: { 
            type: 'uniform', 
            obj : state
        },
        PendulumState: { type: 'storage', format: 'vec4<f32>', count: NUM_PENDULUMS },
        Tubes: { type: 'storage', format: 'f32', count: NUM_PENDULUMS * TUBE_STRIDE, meshRef:"TubeMesh" },
        Spheres: { type: 'storage', format: 'f32', count: NUM_PENDULUMS * SPHERE_STRIDE, meshRef:"SphereMesh" },
        TubeMesh: { type: 'mesh', shape:"tube", division:TUBE_DIVISIONS },
        SphereMesh: { type: 'mesh', shape: 'sphere' }
    },

    // ========================================================
    // 2. Node definitions
    // ========================================================
    shaders: [
        {
            id: 'pendulum_comp',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'PendulumState', varName: 'stateBuffer', access: 'read_write' },
                { resource: 'Tubes', access: 'read_write' },
                { resource: 'Spheres', access: 'read_write' }
            ]
        }
    ],

    uis:[
        { type: "range", obj: state, name: "gravity", label: "Gravity", min: 1.0, max: 20.0, step: 0.1 },
        { type: "range", obj: state, name: "baseLength", label: "String Length", min: 1.0, max: 10.0, step: 0.1 },
        { type: "range", obj: state, name: "bobRadius", label: "Bob Size", min: 0.1, max: 1.0, step: 0.05 },
        { type: "range", obj: state, name: "stringThickness", label: "String Thickness", min: 0.01, max: 0.2, step: 0.01 }
    ]
};
```

### WGSL Compute shader
```wgsl
// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: physics_and_transform_compute
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
@group(0) @binding(2) var<storage, read_write> Tubes: array<f32>;
@group(0) @binding(3) var<storage, read_write> Spheres: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

// Writes 12 floats: Base Pos (3), Vector (3), Radius (1), Padding (1), Color (4)
fn write_tube_params(idx: u32, base_pos: vec3<f32>, vec_to_top: vec3<f32>, radius: f32, color: vec4<f32>) {
    let offset = idx * 12u;
    
    // 1. Position of the center of the base (3 floats)
    Tubes[offset + 0u] = base_pos.x; 
    Tubes[offset + 1u] = base_pos.y; 
    Tubes[offset + 2u] = base_pos.z;
    
    // 2. Vector from base to top (3 floats)
    Tubes[offset + 3u] = vec_to_top.x; 
    Tubes[offset + 4u] = vec_to_top.y; 
    Tubes[offset + 5u] = vec_to_top.z;
    
    // 3. Radius (1 float)
    Tubes[offset + 6u] = radius;
    
    // 4. Padding (1 float - keeps memory aligned to 4-float/16-byte boundaries)
    Tubes[offset + 7u] = 0.0;
    
    // 5. Color (4 floats)
    Tubes[offset + 8u]  = color.r; 
    Tubes[offset + 9u]  = color.g; 
    Tubes[offset + 10u] = color.b; 
    Tubes[offset + 11u] = color.a;
}

// Writes 8 floats: Center Pos (3), Radius (1), Color (4)
fn write_sphere_params(idx: u32, center: vec3<f32>, radius: f32, color: vec4<f32>) {
    let offset = idx * 8u;
    
    // 1. Center Position (3 floats)
    Spheres[offset + 0u] = center.x; 
    Spheres[offset + 1u] = center.y; 
    Spheres[offset + 2u] = center.z;
    
    // 2. Radius (1 float - acts as natural padding for the vec3!)
    Spheres[offset + 3u] = radius;
    
    // 3. Color (4 floats)
    Spheres[offset + 4u] = color.r; 
    Spheres[offset + 5u] = color.g; 
    Spheres[offset + 6u] = color.b; 
    Spheres[offset + 7u] = color.a;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let num_pendulums = arrayLength(&stateBuffer);
    if (idx >= num_pendulums) { return; }

    // ==========================================
    // 1. PHYSICS INTEGRATION
    // ==========================================
    if (params.time == 0.0) {
        let z_offset = (f32(idx) - f32(num_pendulums) / 2.0) * 1.0;
        let frequency_factor = 1.0 + f32(idx) * 0.05;
        let L = params.baseLength / (frequency_factor * frequency_factor);
        stateBuffer[idx] = vec4<f32>(0.5, 0.0, z_offset, L); // theta, omega, z, L
        return;
    }

    var state = stateBuffer[idx];
    let theta = state.x;
    var omega = state.y;
    let z_offset = state.z;
    let L = state.w;

    omega += -(params.gravity / L) * sin(theta) * params.dt;
    let new_theta = theta + omega * params.dt;
    stateBuffer[idx] = vec4<f32>(new_theta, omega, z_offset, L);

    // ==========================================
    // 2. PARAMETER PACKING (No Matrices!)
    // ==========================================
    
    // Common variables
    let pivot = vec3<f32>(0.0, 0.0, z_offset);
    // The vector pointing from the pivot to the bob
    let string_vec = vec3<f32>(L * sin(new_theta), -L * cos(new_theta), 0.0);
    
    // --- TUBE (STRING) DATA ---
    let tube_color = vec4<f32>(0.7, 0.7, 0.7, 1.0);
    write_tube_params(
        idx, 
        pivot,                  // Base is at the pivot
        string_vec,             // Vector reaching down to the bob
        params.stringThickness, // Radius
        tube_color
    );

    // --- BOB (SPHERE) DATA ---
    let bob_center = pivot + string_vec; // Center is exactly at the end of the string
    let hue = f32(idx) / f32(num_pendulums);
    let bob_color = vec4<f32>(0.2 + hue * 0.8, 0.6, 1.0 - hue * 0.5, 1.0);
    
    write_sphere_params(
        idx,
        bob_center,
        params.bobRadius,
        bob_color
    );
}
```

## Vector Field

### Schema
```jsonet
// ==========================================
// 1. Global State and Constants
// ==========================================
const GRID_SIZE = 20;
const NUM_ARROWS = GRID_SIZE * GRID_SIZE; // 400 arrows total

// 12 floats per arrow: Pivot(3) + Vector(3) + Radius(1) + Padding(1) + Color(4)
const ARROW_STRIDE = 12; 
const dispatchX = Math.ceil(NUM_ARROWS / 64);

// The mutable parameters bound to uniform buffer and UI
const state = {
    time: 0.0,
    spacing: 0.5,         // Distance between arrows on the grid
    fieldStrength: 0.4,   // Scales the length of the vectors
    thickness: 0.2,      // Arrow shaft radius
};

// ==========================================
// 2. Schema Object
// ==========================================
const schema : SimulationSchema = {
    name: "Interactive Vector Field",

    resources: {
        // Uniforms
        Params: { 
            type: 'uniform', 
            obj: state 
        },
        
        // Storage Buffer for Arrow Instances
        Arrows: { 
            type: 'storage', 
            format: 'f32', 
            count: NUM_ARROWS * ARROW_STRIDE, 
            meshRef: "ArrowMesh" 
        },
        
        // Mesh Definition
        ArrowMesh: { 
            type: 'mesh', 
            shape: "arrow", 
            division: 16 // Matches the default radialSegments in primitive.ts
        }
    },

    shaders: [
        {
            id: 'vector_field_comp',
            type: 'compute',
            workgroupSize: 64,
            workgroupCount: dispatchX,
            bindings: [
                { resource: 'Params', varName: 'params' },
                { resource: 'Arrows', access: 'read_write' } // Binds to Arrows storage buffer
            ]
        }
    ],

    uis: [
        { type: "range", obj: state, name: "spacing", label: "Grid Spacing", min: 0.1, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "fieldStrength", label: "Field Strength", min: 0.1, max: 2.0, step: 0.1 },
        { type: "range", obj: state, name: "thickness", label: "Arrow Thickness", min: 0.1, max: 1.0, step: 0.1 }
    ]
};
```

### WGSL Compute shader
```wgsl
// ==========================================
// IMPLEMENTATION FOR NODE: vector_field_comp
// ==========================================

struct ParamsStruct {
    time: f32,
    spacing: f32,
    fieldStrength: f32,
    thickness: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> Arrows: array<f32>;

// Helper to pack the 12 floats for the arrow render node
fn write_arrow(idx: u32, pivot: vec3<f32>, vector: vec3<f32>, radius: f32, color: vec4<f32>) {
    let offset = idx * 12u;
    
    // 1. Pivot Position (3 floats)
    Arrows[offset + 0u] = pivot.x; 
    Arrows[offset + 1u] = pivot.y; 
    Arrows[offset + 2u] = pivot.z;
    
    // 2. Direction/Magnitude Vector (3 floats)
    Arrows[offset + 3u] = vector.x; 
    Arrows[offset + 4u] = vector.y; 
    Arrows[offset + 5u] = vector.z;
    
    // 3. Radius (1 float)
    Arrows[offset + 6u] = radius;
    
    // 4. Padding (1 float)
    Arrows[offset + 7u] = 0.0;
    
    // 5. Color (4 floats)
    Arrows[offset + 8u]  = color.r; 
    Arrows[offset + 9u]  = color.g; 
    Arrows[offset + 10u] = color.b; 
    Arrows[offset + 11u] = color.a;
}

const GRID_SIZE: u32 = 20u;
const NUM_ARROWS: u32 = 400u; // GRID_SIZE * GRID_SIZE

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= NUM_ARROWS) { return; }

    // 1. Calculate grid coordinates (X and Z)
    let x_idx = idx % GRID_SIZE;
    let z_idx = idx / GRID_SIZE;
    
    // Center the grid around (0,0,0)
    let half_grid = f32(GRID_SIZE) / 2.0;
    let x = (f32(x_idx) - half_grid) * params.spacing;
    let z = (f32(z_idx) - half_grid) * params.spacing;
    
    let pivot = vec3<f32>(x, 0.0, z);

    // 2. Vector Field Math
    // Let's create a dynamic, swirling field using sin/cos and time
    let vx = sin(z * 1.5 + params.time);
    let vz = cos(x * 1.5 + params.time);
    
    let raw_vector = vec3<f32>(vx, 0.0, vz);
    let arrow_vector = raw_vector * params.fieldStrength;

    // 3. Color generation (Map direction to RGB)
    // Normalize directions to 0.0 -> 1.0 range for colors
    let r = (vx * 0.5) + 0.5;
    let b = (vz * 0.5) + 0.5;
    let color = vec4<f32>(r, 0.3, b, 1.0); 

    // 4. Write to buffer
    write_arrow(idx, pivot, arrow_vector, params.thickness, color);
}
```