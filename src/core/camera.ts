import { mat4, vec3 } from 'gl-matrix';

export class OrbitCamera {
    private canvas: HTMLCanvasElement;
    
    // --- Polar coordinate parameters of the camera ---
    public target = [0.0, 0.0, 0.0]; // Target point (moved by panning)
    public distance: number = 40.0;        // Distance to the camera (changed by zooming)
    public theta: number = 0.0;            // Horizontal angle (changed by rotation)
    public phi: number = Math.PI / 3;      // Vertical angle (changed by rotation)

    // --- Internal state of mouse operations ---
    private isDragging = false;
    private dragButton = -1;
    private lastMouseX = 0;
    private lastMouseY = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.attachEvents();
    }

    private attachEvents() {
        // When the mouse is pressed
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragButton = e.button;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        // When the mouse is released (attached to window considering when it goes out of screen)
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.dragButton = -1;
        });

        // When the mouse is moved
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            if (this.dragButton === 0) { 
                // [Left click: Orbit]
                this.theta -= dx * 0.01;
                this.phi -= dy * 0.01;
                // Limit phi (prevent flipping over straight up/down)
                const epsilon = 0.001;
                this.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, this.phi));
            } 
            else if (this.dragButton === 2) { 
                // [Right click: Pan]
                // 🌟 Fix: Recalculate 'forward', 'right', 'up' vectors from current angle
                
                // 1. Forward vector
                const forward = vec3.fromValues(
                    -Math.sin(this.phi) * Math.sin(this.theta),
                    -Math.cos(this.phi),
                    -Math.sin(this.phi) * Math.cos(this.theta)
                );
                
                // 2. World up direction (Y-axis)
                const worldUp = vec3.fromValues(0, 1, 0);
                
                // 3. Right vector (cross product of forward x up)
                const right = vec3.create();
                vec3.cross(right, forward, worldUp);
                vec3.normalize(right, right); // Normalize just in case
                
                // 4. Camera's true up vector (cross product of right x forward)
                const up = vec3.create();
                vec3.cross(up, right, forward);
                vec3.normalize(up, up);

                // 5. Move the target coordinates
                const panSpeed = this.distance * 0.002;
                vec3.scaleAndAdd(this.target, this.target, right, -dx * panSpeed);
                vec3.scaleAndAdd(this.target, this.target, up, dy * panSpeed);
            }
        });

        // When the wheel is turned
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            // [Wheel: Zoom]
            this.distance += e.deltaY * this.distance * 0.001;
            this.distance = Math.max(1.0, this.distance); // Prevent getting too close
        }, { passive: false });
        
        // Disable browser menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // Calculate actual [x, y, z] camera coordinates from polar coordinates
    private getEyePosition(): [number,number,number] {
        const x = this.target[0] + this.distance * Math.sin(this.phi) * Math.sin(this.theta);
        const y = this.target[1] + this.distance * Math.cos(this.phi);
        const z = this.target[2] + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
        return [x, y, z];
    }

    // Camera view matrix (from where to where it is looking)
    private getViewMatrix(): mat4 {
        const eye = this.getEyePosition();
        const view = mat4.create();
        mat4.lookAt(view, eye, this.target, [0, 1, 0]); // Up direction is always Y-axis
        return view;
    }

    // Called every frame, generates and returns two matrices to pass to GPU
    public getMatrices(aspectRatio: number) {
        const view = this.getViewMatrix();
        
        const proj = mat4.create();
        // FOV: 45 degrees (PI/4), Near clip: 0.1, Far clip: 1000.0
        mat4.perspective(proj, Math.PI / 4, aspectRatio, 0.1, 1000.0);

        const viewProj = mat4.create();
        mat4.multiply(viewProj, proj, view); // Projection matrix x View matrix

        return {
            view: Array.from(view),
            viewProjection: Array.from(viewProj)
        };
    }
}