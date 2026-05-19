# WebGPU Simulation Architecture Overview

This architecture is a framework designed to integrate TypeScript, WebGPU, and WGSL for running highly efficient and safe physical simulations and graphics rendering directly in the browser.

The fundamental design philosophy is **the strict separation of the simulation's "blueprint" (a declarative schema) from its "orchestration" (procedural execution flow)**. By representing the entire pipeline through pure TypeScript objects and WebGPU execution functions, the architecture ensures maximum transparency, maintainability, and control over complex GPU calculations.

---

## The 4-Step Workflow

1.  **Generate the schema definition by TypeScript code:** You (the AI) will create a schema definition using TypeScript code, following the simulation execution instructions provided by the user. This defines the simulation's state, resources (buffers), compute/render nodes, UI definitions and script.
2.  **Generate the WGSL Skeleton (User Action):** The user will run this app to create WGSL codes from the schema. 
WGSL codes include struct definitions, resource bindings and skeleton functions.
3.  **Implement the WGSL Logic:** You (the AI) will be provided with the generated WGSL skeleton codes. 
You must implement ONLY the core logic inside the generated functions (`vs_main`, `fs_main`, or `main`).
4.  **Simulation execution:** The app will run the simulation using the schema and WGSL files.

---

## Schema Structure

This schema strictly separates state, memory allocation (resources), pipeline execution (shaders), user interface (UIs) and script.

## 1. Global State and Constants

Before defining the schema object, declare the simulation parameters and constants.

* **`state` Object:** A plain JavaScript object holding the mutable physics parameters (e.g., `brightness`, `scale`). This object will be referenced by both the Uniform buffers and the UI components.
* **Constants:** Define configuration constants like `NUM_PENDULUMS`, `SPHERE_DIVISION` and `gravitational constant`.

## 2. Schema Object

The `SimulationSchema` is a root object containing the following primary keys: `name`, `resources`, `shaders`, `uis` and `script`.

### A. `resources` (Object / The Memory Pool)

The `resources` field is a **Key-Value Dictionary (Object)**. Order does not matter. It acts as a centralized registry for all WebGPU buffers, uniforms, and meshes.

**Resource Types:**

* **Uniforms:**
* Format: `{ type: 'uniform', obj: [Reference to state object] }`

If the name of the uniform variable is `Params` and the object pointed to by `obj` has `time` property , the app sets the elapsed time to `time`.

The elapsed time is in seconds, and the value of `time` is 0 on the first shader call.

Compute shaders can perform initialization when the value of `time` is 0.

* **Storage Buffers:**
* Format: `{ type: 'storage', format: '[wgsl_type]', count: [Number] }`
* *Optional:* If the buffer drives a mesh, include `meshRef: "[MeshKey]"`.


* **Meshes:**
* Format: `{ type: 'mesh', shape: '[tube|sphere|arrow]', division: [Number] }`



*AI Generation Rule:* Use exact object keys as the resource IDs. Ensure no duplicate keys exist.

### B. `shaders` (Array / The Execution Pipeline)

The `shaders` field is an **Array of Objects**. Order **strictly matters**. This represents the chronological sequence of compute or render passes.

**Shader Pass Properties:**

* `id`: A unique string identifier for the shader pass (e.g., `'pendulum_comp'`).
* `type`: The type of pass (e.g., `'compute'`).
* `workgroupSize`: Integer representing local invocation size (e.g., `64`).
* `workgroupCount`: Total dispatches (usually calculated via constants).
* `bindings`: An array mapping the previously defined `resources` to WGSL variables.
* `resource`: Must exactly match a key defined in the `resources` object.
* `varName`: The variable name to be injected into the WGSL code.
* `access`: Set to `'read_write'` for mutable storage buffers.



### C. `uis` (Array / The User Interface)

The `uis` field is an **Array of Objects**. It instructs the frontend on how to build the control panel, directly binding HTML elements to the `state` object.

**UI Component Properties:**

* `type`: Currently supports `"range"`, which maps to an HTML `<input type="range" />`.
* `obj`: Must reference the global `state` object.
* `name`: The exact key within the `state` object to mutate (e.g., `"gravity"`).
* `label`: Human-readable display text for the UI.
* `min` / `max` / `step`: Numeric constraints for the slider.

### D. `script` (optional)

By default, the shaders in `shaders` are executed sequentially once each time a frame is rendered.

If you want to change the number of times a specific shader is executed, you can specify this in a script.

For example, the following script executes shaderB three times.
```js
execute(shaderA);
for(const _ of range(3)){
    execute(shaderB);
}
execute(shaderC);
```

## Example Output Validation

When generating this schema, ensure that:

1. Every `resource` referenced in `shaders[].bindings` exists in the `resources` object.
2. Every `meshRef` referenced in a storage buffer exists as a `type: 'mesh'` resource.
3. Every `name` referenced in the `uis` array exists in the `state` object.