interface TagInputConfig {
    element: HTMLElement;
    availableOptions: string[];
    initialTags?: string[];
}

export class TagInput {
    private container: HTMLElement;
    private input!: HTMLInputElement;
    private tagsContainer!: HTMLElement;
    private dropdown!: HTMLElement;

    private tags: Set<string>;
    private availableOptions: string[];
    private isDropdownOpen: boolean = false;

    constructor(config: TagInputConfig) {
        this.container = config.element;
        this.availableOptions = config.availableOptions;
        this.tags = new Set(config.initialTags || []);

        this.initDOM();
        this.bindEvents();
        this.renderTags();
    }

    /**
     * Initializes the DOM structure inside the provided container.
     */
    private initDOM(): void {
        this.container.classList.add('tag-input-wrapper');

        // Container for the pill tags
        this.tagsContainer = document.createElement('div');
        this.tagsContainer.classList.add('tag-input-pills');

        // The text input field
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.classList.add('tag-input-field');
        this.input.placeholder = 'Add a tag...';

        // The autocomplete dropdown
        this.dropdown = document.createElement('ul');
        this.dropdown.classList.add('tag-input-dropdown');

        this.tagsContainer.appendChild(this.input);
        this.container.appendChild(this.tagsContainer);
        this.container.appendChild(this.dropdown);
    }

    /**
     * Attaches all necessary event listeners.
     */
    private bindEvents(): void {
        // Handle typing (filtering dropdown)
        this.input.addEventListener('input', () => {
            this.handleInput();
        });

        // Handle Enter and Comma keys
        this.input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault(); // Prevent comma from appearing in the input
                this.addTag(this.input.value);
            } else if (e.key === 'Backspace' && this.input.value === '') {
                // Optional: Remove last tag on backspace if input is empty
                const tagArray = Array.from(this.tags);
                if (tagArray.length > 0) {
                    this.removeTag(tagArray[tagArray.length - 1]);
                }
            }
        });

        // Handle clicking outside to close dropdown
        document.addEventListener('click', (e: MouseEvent) => {
            if (!this.container.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });

        // Handle clicking on the wrapper to focus the input
        this.container.addEventListener('click', () => {
            this.input.focus();
        });
    }

    /**
     * Filters the available options and renders the dropdown.
     */
    private handleInput(): void {
        const value = this.input.value.trim().toLowerCase();

        if (!value) {
            this.closeDropdown();
            return;
        }

        // Filter options that match input AND aren't already selected
        const filtered = this.availableOptions.filter(
            option =>
                option.toLowerCase().includes(value) &&
                !this.tags.has(option)
        );

        if (filtered.length > 0) {
            this.renderDropdown(filtered);
        } else {
            this.closeDropdown();
        }
    }

    /**
     * Adds a tag if it's valid and not a duplicate.
     */
    public addTag(value: string): void {
        const tag = value.trim();

        if (tag && !this.tags.has(tag)) {
            this.tags.add(tag);
            this.renderTags();
        }

        this.input.value = '';
        this.closeDropdown();
    }

    /**
     * Removes a specific tag.
     */
    public removeTag(tag: string): void {
        this.tags.delete(tag);
        this.renderTags();
        this.input.focus();
    }

    /**
     * Renders the pill elements to the DOM.
     */
    private renderTags(): void {
        // Clear current pills (keeping the input element)
        Array.from(this.tagsContainer.querySelectorAll('.tag-pill')).forEach(el => el.remove());

        const fragment = document.createDocumentFragment();

        this.tags.forEach(tag => {
            const pill = document.createElement('span');
            pill.classList.add('tag-pill');
            pill.textContent = tag;

            const removeBtn = document.createElement('span');
            removeBtn.classList.add('tag-remove');
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTag(tag);
            });

            pill.appendChild(removeBtn);
            fragment.appendChild(pill);
        });

        // Insert pills before the input field
        this.tagsContainer.insertBefore(fragment, this.input);
    }

    /**
     * Renders the autocomplete dropdown list.
     */
    private renderDropdown(options: string[]): void {
        this.dropdown.innerHTML = '';

        options.forEach(option => {
            const li = document.createElement('li');
            li.classList.add('tag-dropdown-item');
            li.textContent = option;

            li.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addTag(option);
            });

            this.dropdown.appendChild(li);
        });

        this.dropdown.classList.add('active');
        this.isDropdownOpen = true;
    }

    private closeDropdown(): void {
        this.dropdown.classList.remove('active');
        this.isDropdownOpen = false;
    }

    /**
     * Returns the current array of selected tags.
     */
    public getTags(): string[] {
        return Array.from(this.tags);
    }
}

export const webGpuTags: string[] = [
  // Physics & Dynamics
  'classical-mechanics', 'fluid-dynamics', 'thermodynamics', 'electromagnetism', 'quantum-mechanics', 'optics', 'acoustics', 'rigid-body-dynamics',
  'soft-body-physics', 'collision-detection', 'gravity-simulation', 'aerodynamics', 'kinematics', 'particle-physics', 'relativity',

  // Mathematics & Geometry
  'geometry', 'topology', 'non-euclidean', 'fractals', 'mandelbrot', 'chaos-theory', 'differential-equations', 'linear-algebra',
  'quaternions', 'matrices', 'calculus', 'vector-fields', 'complex-analysis', 'number-theory', 'graph-theory',

  // Simulation Algorithms & Techniques
  'n-body-simulation', 'cellular-automata', 'conways-game-of-life', 'particle-system', 'boids', 'flocking', 'reaction-diffusion', 'turing-patterns',
  'l-systems', 'monte-carlo', 'finite-element-method', 'smoothed-particle-hydrodynamics', 'verlet-integration', 'euler-integration', 'runge-kutta',

  // Rendering & Visuals
  'raymarching', 'raytracing', 'marching-cubes', 'voronoi', 'perlin-noise', 'procedural-generation', 'physically-based-rendering', 'volumetric-rendering',
  'post-processing', 'data-visualization', 'generative-art', 'ambient-occlusion', 'caustics', 'shadow-mapping', 'audio-reactive',

  // Specific Phenomena
  'double-pendulum', 'black-hole', 'solar-system', 'magnetic-fields', 'wave-equation', 'interference-pattern', 'lorenz-attractor',
  'strange-attractor', 'schrodinger-equation', 'brownian-motion',

  // WebGPU & Architecture
  'webgpu', 'wgsl', 'compute-shader', 'fragment-shader', 'vertex-shader', 'parallel-computing', 'gpu-acceleration', 'buffers',
  'multi-threading', 'render-pipeline', 'compute-pipeline', 'webgl-port', 'performance-test', 'benchmark', 'real-time',

  // Application & User Experience
  'interactive', 'educational', 'sandbox', 'tutorial', 'open-source', 'vr-ready', 'ar-ready', 'mobile-friendly',
  'desktop-only', 'concept-demo', 'stress-test', 'game-mechanic', 'puzzle', 'math-proof', 'wip'
];


// You can retrieve the selected tags at any time:
// console.log(myInput.getTags());
export function testTagInput(){
    // Pre-downloaded/local array of options

    // Initialize the component
    const myInput = new TagInput({
    element: document.getElementById('my-tag-input')!,
    availableOptions: webGpuTags.map(x => x.replaceAll("-", " ")),
    initialTags: ["TypeScript"] // Optional starting state
    });

}