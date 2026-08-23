import {Vector3} from "three";

type ColorRepresentation = string | number;

export interface CubeElement {
    color: ColorRepresentation;
    pos: Vector3;
    normal: Vector3;
    withLogo?: boolean;
}

type CubeColor = [ColorRepresentation, ColorRepresentation, ColorRepresentation, ColorRepresentation, ColorRepresentation, ColorRepresentation];

class CubeData {
    /**
     * 魔方阶级
     */
    public cubeOrder: number;
    /**
     * 魔方颜色：top、bottom、left、right、front、back
     */
    private colors: CubeColor;
    private _size = 1;
    public get elementSize() {
        return this._size;
    }
    public elements: CubeElement[] = [];
    public constructor(cubeOrder = 3, colors: CubeColor = ["#fb3636", "#ff9351", "#fade70", "#9de16f", "#51acfa", "#da6dfa"]) {
        this.cubeOrder = cubeOrder;
        this.colors = colors;
        this.initElements();
    };

    /**
     * 初始化数据
     * Persistence is gifos.db in the GifOS shell, never localStorage.
     */
    private initElements(_localDataFirst = false) {
        this.initialFinishData();
    }

    /**
     * 创建复原的数据
     */
    public initialFinishData() {
        this.elements = [];
        const border = (this.cubeOrder * this._size) / 2 - 0.5;

        // top and bottom
        for (let x = -border; x <= border; x++) {
            for (let z = -border; z <= border; z++) {
                this.elements.push({
                    color: this.colors[0],
                    pos: new Vector3(x, border + this._size * 0.5, z),
                    normal: new Vector3(0, 1, 0)
                });

                this.elements.push({
                    color: this.colors[1],
                    pos: new Vector3(x, -border - this._size * 0.5, z),
                    normal: new Vector3(0, -1, 0)
                });
            }
        }

        // left and right
        for (let y = -border; y <= border; y++) {
            for (let z = -border; z <= border; z++) {
                this.elements.push({
                    color: this.colors[2],
                    pos: new Vector3(-border - this._size * 0.5, y, z),
                    normal: new Vector3(-1, 0, 0),
                });

                this.elements.push({
                    color: this.colors[3],
                    pos: new Vector3(border + this._size * 0.5, y, z),
                    normal: new Vector3(1, 0, 0)
                });
            }
        }

        // front and back
        for (let x = -border; x <= border; x++) {
            for (let y = -border; y <= border; y++) {
                this.elements.push({
                    color: this.colors[4],
                    pos: new Vector3(x, y, border + this._size * 0.5),
                    normal: new Vector3(0, 0, 1),
                    withLogo: x === 0 && y === 0
                });

                this.elements.push({
                    color: this.colors[5],
                    pos: new Vector3(x, y, -border - this._size * 0.5),
                    normal: new Vector3(0, 0, -1)
                });
            }
        }

        // this.elements.forEach((ele) => console.log(ele.pos));
    }

    /**
     * 保存数据至 localStorage
     */
    public saveDataToLocal() {}

    public getLocalData() {
        return [];
    }
}

export default CubeData;
