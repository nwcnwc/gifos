import {PerspectiveCamera, Scene, WebGLRenderer} from "three";
import createCamera from "./components/camera";
import createScene from "./components/scene";
import createRenderer from "./components/renderer";
import {Cube} from "./core/cube";
import {PointerControl} from "./core/control";

export type TurnInfo = {moves: number; finish: boolean; turns: number};

const setSize = (container: Element, camera: PerspectiveCamera, renderer: WebGLRenderer) => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const el = renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
};

class Rubiks {
    private camera: PerspectiveCamera;
    private scene: Scene;
    private cube: Cube | undefined;
    private renderer: WebGLRenderer;
    private container: Element;
    private _controls: PointerControl[] = [];
    private _moves = 0;
    private _seed: number | null = null;
    private _onTurn: ((info: TurnInfo) => void) | null = null;
    private _onFinish: ((info: TurnInfo) => void) | null = null;
    private _ro: ResizeObserver | null = null;
    private _disposed = false;

    public constructor(container: Element) {
        this.container = container;
        this.camera = createCamera();
        this.camera.far = 1000;
        this.camera.updateProjectionMatrix();
        this.scene = createScene("#12141c");
        this.renderer = createRenderer();
        const canvas = this.renderer.domElement;
        canvas.style.touchAction = "none";
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        container.appendChild(canvas);

        const onResize = () => {
            if (this._disposed) return;
            setSize(container, this.camera, this.renderer);
            this.fitCamera();
            this.render();
        };
        window.addEventListener("resize", onResize);
        if (typeof ResizeObserver !== "undefined") {
            this._ro = new ResizeObserver(onResize);
            this._ro.observe(container);
        }
        setSize(container, this.camera, this.renderer);
        this.setOrder(3);
    }

    public get moves() { return this._moves; }
    public get order() { return this.cube ? this.cube.order : 3; }
    public get finish() { return this.cube ? this.cube.finish : true; }
    public get seed() { return this._seed; }

    public onTurn(cb: ((info: TurnInfo) => void) | null) { this._onTurn = cb; }
    public onFinish(cb: ((info: TurnInfo) => void) | null) { this._onFinish = cb; }

    public setOrder(order: number) {
        const n = Math.max(2, Math.min(10, order | 0));
        this.scene.remove(...this.scene.children);
        if (this._controls.length > 0) {
            this._controls.forEach((c) => c.dispose());
            this._controls = [];
        }
        const cube = new Cube(n);
        cube.onTurn = (turns, finish) => {
            if (turns) this._moves += 1;
            const info = {moves: this._moves, finish, turns};
            if (this._onTurn) this._onTurn(info);
            if (finish && this._onFinish) this._onFinish(info);
        };
        this.scene.add(cube);
        this.cube = cube;
        this._moves = 0;
        this._seed = null;
        this._controls.push(new PointerControl(this.camera, this.scene, this.renderer, cube));
        this.fitCamera();
        this.render();
    }

    /**
     * Shuffle from a solved cube using a deterministic seed. Same seed + order
     * produces the same scramble on every peer. Upstream's disorder() was empty.
     */
    public scramble(seed?: number) {
        if (!this.cube) return 0;
        const s = seed == null ? ((Math.random() * 0x100000000) >>> 0) : (seed >>> 0);
        this.cube.restore();
        this.cube.scramble(s);
        this._seed = s;
        this._moves = 0;
        this.render();
        return s;
    }

    public restore() {
        if (this.cube) {
            this.cube.restore();
            this._moves = 0;
            this._seed = null;
            this.render();
        }
    }

    public dispose() {
        this._disposed = true;
        if (this._ro) this._ro.disconnect();
        this._controls.forEach((c) => c.dispose());
        this._controls = [];
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }

    private fitCamera() {
        if (!this.cube) return;
        this.camera.position.set(0, 0, 15);
        this.camera.updateProjectionMatrix();
        const winW = this.renderer.domElement.clientWidth;
        const winH = this.renderer.domElement.clientHeight;
        if (winW < 2 || winH < 2) return;
        const coarseSize = this.cube.getCoarseCubeSize(this.camera, {w: winW, h: winH});
        if (!coarseSize) return;
        const ratio = Math.max(2.2 / (winW / coarseSize), 2.2 / (winH / coarseSize));
        this.camera.position.z *= ratio;
    }

    private render() {
        this.renderer.render(this.scene, this.camera);
    }
}

export default Rubiks;
