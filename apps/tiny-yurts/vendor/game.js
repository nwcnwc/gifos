(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/modified-kontra/game-loop.js
  function GameLoop({
    update,
    render
  }) {
    let fps = 60;
    let accumulator = 0;
    let delta = 1e3 / fps;
    let step = 1 / fps;
    let last, rAF, now, dt, loop2;
    function frame() {
      rAF = requestAnimationFrame(frame);
      now = performance.now();
      dt = now - last;
      last = now;
      accumulator += dt;
      while (accumulator >= delta) {
        loop2.update(step);
        accumulator -= delta;
      }
      loop2.render();
    }
    loop2 = {
      update,
      render,
      isStopped: true,
      start() {
        last = performance.now();
        this.isStopped = false;
        requestAnimationFrame(frame);
      },
      stop() {
        this.isStopped = true;
        cancelAnimationFrame(rAF);
      }
    };
    return loop2;
  }

  // src/colors.js
  var colors = {
    grass: "#8a5",
    leaf: "#ac6",
    base: "#794",
    yurt: "#fff",
    path: "#dca",
    // previously #cb9
    ox: "#b75",
    oxHorn: "#dee",
    goat: "#abb",
    // previously #abb
    fish: "#f80",
    black: "#000",
    ui: "#443",
    red: "#e31",
    grid: "#0001",
    shade: "#0001",
    shade2: "#0002",
    gridRed: "#f002"
  };
  var shadowOpacity = 0.12;

  // src/svg-utils.js
  var createSvgElement = (tag = "svg") => document.createElementNS("http://www.w3.org/2000/svg", tag);

  // src/create-element.js
  var createElement = (tag = "div") => document.createElement(tag);

  // src/svg.js
  var gridCellSize = 8;
  var boardOffsetX = 3;
  var boardOffsetY = 2;
  var boardWidth = 20;
  var boardHeight = 10;
  var boardSvgWidth = boardWidth * gridCellSize;
  var boardSvgHeight = boardHeight * gridCellSize;
  var gridWidth = boardOffsetX + boardWidth + boardOffsetX;
  var gridHeight = boardOffsetY + boardHeight + boardOffsetY;
  var gridSvgWidth = gridWidth * gridCellSize;
  var gridSvgHeight = gridHeight * gridCellSize;
  var scaledGridLineThickness = 0.5;
  var gridLineThickness = scaledGridLineThickness / 2;
  var svgContainerElement = createElement();
  svgContainerElement.style.cssText = `
  position: absolute;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: ${colors.grass};
`;
  svgContainerElement.style.width = "100vw";
  svgContainerElement.style.height = "100vh";
  document.body.append(svgContainerElement);
  var svgHazardLines = createElement();
  svgHazardLines.style.cssText = `
  position: absolute;
  display: grid;
  background: repeating-linear-gradient(-55deg, #0001 0 12px, #0000 0 24px);
`;
  svgHazardLines.style.width = "100vw";
  svgHazardLines.style.height = "100vh";
  svgHazardLines.style.opacity = 0;
  svgHazardLines.style.willChange = "opacity";
  svgHazardLines.style.transition = "opacity.3s";
  var svgHazardLinesRed = createElement();
  svgHazardLinesRed.style.cssText = `
  position: absolute;
  display: grid;
  background: repeating-linear-gradient(-55deg, #f002 0 12px, #0000 0 24px);
`;
  svgHazardLinesRed.style.width = "100vw";
  svgHazardLinesRed.style.height = "100vh";
  svgHazardLinesRed.style.opacity = 0;
  svgHazardLinesRed.style.willChange = "opacity";
  svgHazardLinesRed.style.transition = `opacity .3s`;
  svgContainerElement.append(svgHazardLines, svgHazardLinesRed);
  var svgElement = createSvgElement();
  svgElement.style.cssText = `
  position: relative;
  display: grid;
  touch-action: none;
`;
  svgElement.setAttribute("viewBox", `0 0 ${gridSvgWidth} ${gridSvgHeight}`);
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svgElement.style.width = "100vw";
  svgElement.style.height = "100vh";
  svgElement.style.maxHeight = "68vw";
  svgElement.style.maxWidth = "200vh";
  svgContainerElement.append(svgElement);

  // node_modules/kontra/kontra.mjs
  function radToDeg(rad) {
    return rad * 180 / Math.PI;
  }
  function angleToTarget(source, target) {
    return Math.atan2(target.y - source.y, target.x - source.x);
  }
  function clamp(min, max, value) {
    return Math.min(Math.max(min, value), max);
  }
  var Vector = class _Vector {
    constructor(x = 0, y = 0, vec = {}) {
      if (x.x != void 0) {
        this.x = x.x;
        this.y = x.y;
      } else {
        this.x = x;
        this.y = y;
      }
      if (vec._c) {
        this.clamp(vec._a, vec._b, vec._d, vec._e);
        this.x = x;
        this.y = y;
      }
    }
    /**
     * Set the x and y coordinate of the vector.
     * @memberof Vector
     * @function set
     *
     * @param {Vector|{x: number, y: number}} vector - Vector to set coordinates from.
     */
    set(vec) {
      this.x = vec.x;
      this.y = vec.y;
    }
    /**
     * Calculate the addition of the current vector with the given vector.
     * @memberof Vector
     * @function add
     *
     * @param {Vector|{x: number, y: number}} vector - Vector to add to the current Vector.
     *
     * @returns {Vector} A new Vector instance whose value is the addition of the two vectors.
     */
    add(vec) {
      return new _Vector(this.x + vec.x, this.y + vec.y, this);
    }
    // @ifdef VECTOR_SUBTRACT
    /**
     * Calculate the subtraction of the current vector with the given vector.
     * @memberof Vector
     * @function subtract
     *
     * @param {Vector|{x: number, y: number}} vector - Vector to subtract from the current Vector.
     *
     * @returns {Vector} A new Vector instance whose value is the subtraction of the two vectors.
     */
    subtract(vec) {
      return new _Vector(this.x - vec.x, this.y - vec.y, this);
    }
    // @endif
    // @ifdef VECTOR_SCALE
    /**
     * Calculate the multiple of the current vector by a value.
     * @memberof Vector
     * @function scale
     *
     * @param {Number} value - Value to scale the current Vector.
     *
     * @returns {Vector} A new Vector instance whose value is multiplied by the scalar.
     */
    scale(value) {
      return new _Vector(this.x * value, this.y * value);
    }
    // @endif
    // @ifdef VECTOR_NORMALIZE
    /**
     * Calculate the normalized value of the current vector. Requires the Vector [length](api/vector#length) function.
     * @memberof Vector
     * @function normalize
     *
     * @returns {Vector} A new Vector instance whose value is the normalized vector.
     */
    // @see https://github.com/jed/140bytes/wiki/Byte-saving-techniques#use-placeholder-arguments-instead-of-var
    normalize(length = this.length() || 1) {
      return new _Vector(this.x / length, this.y / length);
    }
    // @endif
    // @ifdef VECTOR_DOT||VECTOR_ANGLE
    /**
     * Calculate the dot product of the current vector with the given vector.
     * @memberof Vector
     * @function dot
     *
     * @param {Vector|{x: number, y: number}} vector - Vector to dot product against.
     *
     * @returns {Number} The dot product of the vectors.
     */
    dot(vec) {
      return this.x * vec.x + this.y * vec.y;
    }
    // @endif
    // @ifdef VECTOR_LENGTH||VECTOR_NORMALIZE||VECTOR_ANGLE
    /**
     * Calculate the length (magnitude) of the Vector.
     * @memberof Vector
     * @function length
     *
     * @returns {Number} The length of the vector.
     */
    length() {
      return Math.hypot(this.x, this.y);
    }
    // @endif
    // @ifdef VECTOR_DISTANCE
    /**
     * Calculate the distance between the current vector and the given vector.
     * @memberof Vector
     * @function distance
     *
     * @param {Vector|{x: number, y: number}} vector - Vector to calculate the distance between.
     *
     * @returns {Number} The distance between the two vectors.
     */
    distance(vec) {
      return Math.hypot(this.x - vec.x, this.y - vec.y);
    }
    // @endif
    // @ifdef VECTOR_ANGLE
    /**
     * Calculate the angle (in radians) between the current vector and the given vector. Requires the Vector [dot](api/vector#dot) and [length](api/vector#length) functions.
     * @memberof Vector
     * @function angle
     *
     * @param {Vector} vector - Vector to calculate the angle between.
     *
     * @returns {Number} The angle (in radians) between the two vectors.
     */
    angle(vec) {
      return Math.acos(this.dot(vec) / (this.length() * vec.length()));
    }
    // @endif
    // @ifdef VECTOR_DIRECTION
    /**
     * Calculate the angle (in radians) of the current vector.
     * @memberof Vector
     * @function direction
     *
     * @returns {Number} The angle (in radians) of the vector.
     */
    direction() {
      return Math.atan2(this.y, this.x);
    }
    // @endif
    // @ifdef VECTOR_CLAMP
    /**
     * Clamp the Vector between two points, preventing `x` and `y` from going below or above the minimum and maximum values. Perfect for keeping a sprite from going outside the game boundaries.
     *
     * ```js
     * import { Vector } from 'kontra';
     *
     * let vector = Vector(100, 200);
     * vector.clamp(0, 0, 200, 300);
     *
     * vector.x += 200;
     * console.log(vector.x);  //=> 200
     *
     * vector.y -= 300;
     * console.log(vector.y);  //=> 0
     *
     * vector.add({x: -500, y: 500});
     * console.log(vector);    //=> {x: 0, y: 300}
     * ```
     * @memberof Vector
     * @function clamp
     *
     * @param {Number} xMin - Minimum x value.
     * @param {Number} yMin - Minimum y value.
     * @param {Number} xMax - Maximum x value.
     * @param {Number} yMax - Maximum y value.
     */
    clamp(xMin, yMin, xMax, yMax) {
      this._c = true;
      this._a = xMin;
      this._b = yMin;
      this._d = xMax;
      this._e = yMax;
    }
    /**
     * X coordinate of the vector.
     * @memberof Vector
     * @property {Number} x
     */
    get x() {
      return this._x;
    }
    /**
     * Y coordinate of the vector.
     * @memberof Vector
     * @property {Number} y
     */
    get y() {
      return this._y;
    }
    set x(value) {
      this._x = this._c ? clamp(this._a, this._d, value) : value;
    }
    set y(value) {
      this._y = this._c ? clamp(this._b, this._e, value) : value;
    }
    // @endif
  };
  function factory$a() {
    return new Vector(...arguments);
  }

  // src/modified-kontra/updatable.js
  var Updatable = class {
    constructor(properties) {
      return this.init(properties);
    }
    init(properties = {}) {
      this.position = new factory$a();
      this.velocity = new factory$a();
      this.acceleration = new factory$a();
      this.isAlive = true;
      Object.assign(this, properties);
    }
    update(dt) {
      this.advance(dt);
    }
    advance(dt) {
      let acceleration = this.acceleration;
      if (dt) {
        acceleration = acceleration.scale(dt);
      }
      this.velocity = this.velocity.add(acceleration);
      let velocity = this.velocity;
      if (dt) {
        velocity = velocity.scale(dt);
      }
      this.position = this.position.add(velocity);
      this._pc();
    }
    get dx() {
      return this.velocity.x;
    }
    get dy() {
      return this.velocity.y;
    }
    set dx(value) {
      this.velocity.x = value;
    }
    set dy(value) {
      this.velocity.y = value;
    }
    _pc() {
    }
  };
  var updatable_default = Updatable;

  // src/modified-kontra/game-object.js
  var GameObject = class extends updatable_default {
    init(_a) {
      var _b = _a, {
        width = 1,
        height = 1,
        render = this.draw,
        update = this.advance,
        children = []
      } = _b, props = __objRest(_b, [
        "width",
        "height",
        "render",
        "update",
        "children"
      ]);
      this._c = [];
      super.init(__spreadValues({
        width,
        height
      }, props));
      this.addChild(children);
      this._rf = render;
      this._uf = update;
    }
    /**
     * Update all children
     */
    update(dt) {
      this._uf(dt);
      this.children.map((child) => child.update && child.update(dt));
    }
    render() {
      this._rf();
      let children = this.children;
      children.map((child) => child.render && child.render());
    }
    _pc() {
      this.children.map((child) => child._pc());
    }
    get x() {
      return this.position.x;
    }
    get y() {
      return this.position.y;
    }
    set x(value) {
      this.position.x = value;
      this._pc();
    }
    set y(value) {
      this.position.y = value;
      this._pc();
    }
    get width() {
      return this._w;
    }
    set width(value) {
      this._w = value;
      this._pc();
    }
    get height() {
      return this._h;
    }
    set height(value) {
      this._h = value;
      this._pc();
    }
    set children(value) {
      this.removeChild(this._c);
      this.addChild(value);
    }
    get children() {
      return this._c;
    }
    addChild(...objects) {
      objects.flat().map((child) => {
        this.children.push(child);
        child.parent = this;
        child._pc = child._pc || noop;
        child._pc();
      });
    }
    // We never remove children, so this has been commented out
    // removeChild(...objects) {
    //   objects.flat().map(child => {
    //     if (removeFromArray(this.children, child)) {
    //       child.parent = null;
    //       child._pc();
    //     }
    //   });
    // }
  };

  // src/grid.js
  var scaledGridLineThickness2 = 1;
  var gridLineThickness2 = scaledGridLineThickness2 / 2;
  var gridRect = createSvgElement("rect");
  var gridRectRed = createSvgElement("rect");
  var gridPointerHandler = createSvgElement("rect");
  var addGridBackgroundToSvg = () => {
    const gridRectBackground = createSvgElement("rect");
    gridRectBackground.setAttribute("fill", colors.grass);
    gridRectBackground.setAttribute("width", `${boardSvgWidth + gridLineThickness2}px`);
    gridRectBackground.setAttribute("height", `${boardSvgHeight + gridLineThickness2}px`);
    gridRectBackground.setAttribute("transform", `translate(${boardOffsetX * gridCellSize - gridLineThickness2 / 2} ${boardOffsetY * gridCellSize - gridLineThickness2 / 2})`);
    svgElement.append(gridRectBackground);
  };
  var addGridToSvg = () => {
    const defs = createSvgElement("defs");
    svgElement.append(defs);
    const pattern = createSvgElement("pattern");
    pattern.setAttribute("id", "grid");
    pattern.setAttribute("width", gridCellSize);
    pattern.setAttribute("height", gridCellSize);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    defs.append(pattern);
    const gridPath = createSvgElement("path");
    gridPath.setAttribute("d", `M${gridCellSize} 0 0 0 0 ${gridCellSize}`);
    gridPath.setAttribute("fill", "none");
    gridPath.setAttribute("stroke", colors.grid);
    gridPath.setAttribute("stroke-width", scaledGridLineThickness2);
    pattern.append(gridPath);
    gridRect.setAttribute("width", `${boardSvgWidth + gridLineThickness2}px`);
    gridRect.setAttribute("height", `${boardSvgHeight + gridLineThickness2}px`);
    gridRect.setAttribute("transform", `translate(${boardOffsetX * gridCellSize - gridLineThickness2 / 2} ${boardOffsetY * gridCellSize - gridLineThickness2 / 2})`);
    gridRect.setAttribute("fill", "url(#grid)");
    gridRect.style.opacity = 0;
    gridRect.style.willChange = "opacity";
    gridRect.style.transition = "opacity.3s";
    const patternRed = createSvgElement("pattern");
    patternRed.setAttribute("id", "gridred");
    patternRed.setAttribute("width", gridCellSize);
    patternRed.setAttribute("height", gridCellSize);
    patternRed.setAttribute("patternUnits", "userSpaceOnUse");
    defs.append(patternRed);
    const gridPathRed = createSvgElement("path");
    gridPathRed.setAttribute("d", `M${gridCellSize} 0 0 0 0 ${gridCellSize}`);
    gridPathRed.setAttribute("fill", "none");
    gridPathRed.setAttribute("stroke", colors.gridRed);
    gridPathRed.setAttribute("stroke-width", scaledGridLineThickness2);
    patternRed.append(gridPathRed);
    gridRectRed.setAttribute("width", `${boardSvgWidth + gridLineThickness2}px`);
    gridRectRed.setAttribute("height", `${boardSvgHeight + gridLineThickness2}px`);
    gridRectRed.setAttribute("transform", `translate(${boardOffsetX * gridCellSize - gridLineThickness2 / 2} ${boardOffsetY * gridCellSize - gridLineThickness2 / 2})`);
    gridRectRed.setAttribute("fill", "url(#gridred)");
    gridRectRed.style.opacity = 0;
    gridRectRed.style.willChange = "opacity";
    gridRectRed.style.transition = "opacity.3s";
    svgElement.append(gridRect, gridRectRed);
  };

  // src/layers.js
  var addAnimalShadowLayer = () => {
    const animalShadowLayer2 = createSvgElement("g");
    animalShadowLayer2.setAttribute("opacity", shadowOpacity);
    animalShadowLayer2.setAttribute("transform", "translate(.3,.3)");
    svgElement.append(animalShadowLayer2);
    return animalShadowLayer2;
  };
  var addAnimalLayer = () => {
    const animalLayer2 = createSvgElement("g");
    animalLayer2.setAttribute("stroke-linecap", "round");
    svgElement.append(animalLayer2);
    return animalLayer2;
  };
  var addFenceShadowLayer = () => {
    const fenceShadowLayer2 = createSvgElement("g");
    fenceShadowLayer2.setAttribute("stroke-linecap", "round");
    fenceShadowLayer2.setAttribute("fill", "none");
    fenceShadowLayer2.setAttribute("stroke", colors.black);
    fenceShadowLayer2.setAttribute("opacity", shadowOpacity);
    fenceShadowLayer2.setAttribute("transform", "translate(.5,.5)");
    svgElement.append(fenceShadowLayer2);
    return fenceShadowLayer2;
  };
  var addRockShadowLayer = () => {
    const rockShadowLayer2 = createSvgElement("g");
    rockShadowLayer2.setAttribute("stroke-linecap", "round");
    rockShadowLayer2.setAttribute("fill", "none");
    rockShadowLayer2.setAttribute("stroke", colors.black);
    rockShadowLayer2.setAttribute("opacity", shadowOpacity);
    rockShadowLayer2.setAttribute("transform", "translate(.3,.3)");
    svgElement.append(rockShadowLayer2);
    return rockShadowLayer2;
  };
  var addGridBlockLayer = () => {
    const gridBlockLayer2 = createSvgElement("g");
    gridBlockLayer2.setAttribute("fill", "none");
    svgElement.append(gridBlockLayer2);
    return gridBlockLayer2;
  };
  var addFenceLayer = () => {
    const fenceLayer2 = createSvgElement("g");
    fenceLayer2.setAttribute("stroke-linecap", "round");
    fenceLayer2.setAttribute("fill", "none");
    svgElement.append(fenceLayer2);
    return fenceLayer2;
  };
  var addBaseLayer = () => {
    const baseLayer2 = createSvgElement("g");
    baseLayer2.setAttribute("fill", colors.base);
    svgElement.append(baseLayer2);
    return baseLayer2;
  };
  var addPathShadowLayer = () => {
    const pathShadowLayer2 = createSvgElement("g");
    pathShadowLayer2.setAttribute("stroke-linecap", "round");
    pathShadowLayer2.setAttribute("fill", "none");
    pathShadowLayer2.setAttribute("stroke", colors.base);
    pathShadowLayer2.setAttribute("stroke-width", 3.14);
    svgElement.append(pathShadowLayer2);
    return pathShadowLayer2;
  };
  var addPathLayer = () => {
    const pathLayer2 = createSvgElement("g");
    pathLayer2.setAttribute("stroke-linecap", "round");
    pathLayer2.setAttribute("fill", "none");
    pathLayer2.setAttribute("stroke", colors.path);
    pathLayer2.setAttribute("stroke-width", 3.14);
    svgElement.append(pathLayer2);
    return pathLayer2;
  };
  var addPersonLayer = () => {
    const personLayer2 = createSvgElement("g");
    personLayer2.setAttribute("stroke-linecap", "round");
    personLayer2.setAttribute("fill", "none");
    svgElement.append(personLayer2);
    return personLayer2;
  };
  var addPondLayer = () => {
    const pondLayer2 = createSvgElement("g");
    svgElement.append(pondLayer2);
    return pondLayer2;
  };
  var addYurtAndPersonShadowLayer = () => {
    const shadowLayer = createSvgElement("g");
    shadowLayer.setAttribute("stroke-linecap", "round");
    shadowLayer.setAttribute("fill", "none");
    shadowLayer.setAttribute("stroke", colors.black);
    shadowLayer.setAttribute("opacity", 0.2);
    svgElement.append(shadowLayer);
    return shadowLayer;
  };
  var addYurtLayer = () => {
    const yurtLayer2 = createSvgElement("g");
    yurtLayer2.setAttribute("stroke-linecap", "round");
    yurtLayer2.setAttribute("fill", colors.yurt);
    svgElement.append(yurtLayer2);
    return yurtLayer2;
  };
  var addTreeShadowLayer = () => {
    const treeShadowLayer2 = createSvgElement("g");
    svgElement.append(treeShadowLayer2);
    return treeShadowLayer2;
  };
  var addTreeLayer = () => {
    const treeLayer2 = createSvgElement("g");
    svgElement.append(treeLayer2);
    return treeLayer2;
  };
  var addPinLayer = () => {
    const pinLayer2 = createSvgElement("g");
    pinLayer2.setAttribute("stroke-linecap", "round");
    svgElement.append(pinLayer2);
    return pinLayer2;
  };
  var addGridPointerLayer = () => {
    const gridPointerLayer2 = createSvgElement("rect");
    gridPointerLayer2.setAttribute("width", `${boardSvgWidth + gridLineThickness2}px`);
    gridPointerLayer2.setAttribute("height", `${boardSvgHeight + gridLineThickness2}px`);
    gridPointerLayer2.setAttribute("transform", `translate(${boardOffsetX * gridCellSize - gridLineThickness2} ${boardOffsetY * gridCellSize - gridLineThickness2})`);
    gridPointerLayer2.setAttribute("fill", "none");
    gridPointerLayer2.setAttribute("stroke-width", 0);
    gridPointerLayer2.style.cursor = "cell";
    gridPointerLayer2.style.pointerEvents = "all";
    svgElement.append(gridPointerLayer2);
    return gridPointerLayer2;
  };
  var layers = {
    gridBackgroundLayer: addGridBackgroundToSvg(),
    pondLayer: addPondLayer(),
    gridLayer: addGridToSvg(),
    gridBlockLayer: addGridBlockLayer(),
    baseLayer: addBaseLayer(),
    pathShadowLayer: addPathShadowLayer(),
    rockShadowLayer: addRockShadowLayer(),
    pathLayer: addPathLayer(),
    animalShadowLayer: addAnimalShadowLayer(),
    yurtAndPersonShadowLayer: addYurtAndPersonShadowLayer(),
    animalLayer: addAnimalLayer(),
    personLayer: addPersonLayer(),
    fenceShadowLayer: addFenceShadowLayer(),
    fenceLayer: addFenceLayer(),
    treeShadowLayer: addTreeShadowLayer(),
    yurtLayer: addYurtLayer(),
    treeLayer: addTreeLayer(),
    pinLayer: addPinLayer(),
    gridPointerLayer: addGridPointerLayer()
  };
  var {
    animalLayer,
    animalShadowLayer,
    baseLayer,
    fenceLayer,
    fenceShadowLayer,
    gridBlockLayer,
    gridLayer,
    gridPointerLayer,
    pathLayer,
    pathShadowLayer,
    personLayer,
    pinLayer,
    pondLayer,
    rockShadowLayer,
    treeLayer,
    treeShadowLayer,
    yurtAndPersonShadowLayer,
    yurtLayer
  } = layers;
  var clearLayers = () => {
    animalLayer.innerHTML = "";
    animalShadowLayer.innerHTML = "";
    baseLayer.innerHTML = "";
    fenceLayer.innerHTML = "";
    fenceShadowLayer.innerHTML = "";
    gridBlockLayer.innerHTML = "";
    pathLayer.innerHTML = "";
    pathShadowLayer.innerHTML = "";
    personLayer.innerHTML = "";
    pinLayer.innerHTML = "";
    pondLayer.innerHTML = "";
    rockShadowLayer.innerHTML = "";
    treeLayer.innerHTML = "";
    treeShadowLayer.innerHTML = "";
    yurtAndPersonShadowLayer.innerHTML = "";
    yurtLayer.innerHTML = "";
  };

  // src/audio.js
  var audioContext;
  var sampleRate = 44100;
  var soundSetings = {
    on: localStorage.getItem("Tiny Yurtss") !== "false"
  };
  var initAudio = () => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  };
  var playSound = (frequencyIndex, noteLength = 2, playbackRate = 1, pingyness = 1, volume = 1, lowpassFrequency = 1e4, highpassFrequency = 100, noise = () => 2 * Math.random() - 1) => {
    if (!soundSetings.on) return;
    const frequency = 130.81 * 1.0595 ** frequencyIndex;
    const bufferData = [];
    const v = [];
    let p = 0;
    const period = sampleRate / frequency;
    let reset;
    const w = () => {
      reset = false;
      return v.length <= 1 + Math.floor(period) ? (v.push(noise()), v.at(-1)) : (v[p] = v[p >= v.length - 1 ? 0 : p + 1] * 0.5 + v[p] * (0.5 - pingyness / 1e3), p >= Math.floor(period) && (reset = true, v[p + 1] = v[0] * 0.5 + v[p + 1] * 0.5), p = reset ? 0 : p + 1, v[p]);
    };
    for (let i = 0; i < sampleRate * noteLength; i++) {
      bufferData[i] = i < 88 ? i / 88 * w() : (1 - (i - 88) / (sampleRate * noteLength)) * w();
    }
    const buffer = audioContext.createBuffer(1, sampleRate * noteLength, sampleRate);
    buffer.getChannelData(0).set(bufferData);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const lowpassNode = audioContext.createBiquadFilter();
    lowpassNode.type = "lowpass";
    lowpassNode.frequency.value = lowpassFrequency;
    const lowpassNode2 = audioContext.createBiquadFilter();
    lowpassNode2.type = "lowpass";
    lowpassNode2.frequency.value = lowpassFrequency;
    const highpassNode = audioContext.createBiquadFilter();
    highpassNode.type = "highpass";
    highpassNode.frequency.value = highpassFrequency;
    const volumeNode = audioContext.createGain();
    volumeNode.gain.value = volume;
    source.connect(lowpassNode);
    lowpassNode.connect(lowpassNode2);
    lowpassNode2.connect(highpassNode);
    highpassNode.connect(volumeNode);
    volumeNode.connect(audioContext.destination);
    source.start();
  };
  var warnNotes = {
    [colors.ox]: {
      currentIndex: 0,
      notes: [
        [18, 0.5, 0.5, 30, 0.2, 1800, 200],
        // F#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [10, 0.5, 0.5, 30, 0.2, 1800, 200],
        // A#
        [18, 0.5, 0.5, 30, 0.2, 1800, 200],
        // F#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [18, 0.5, 0.5, 30, 0.2, 1800, 200],
        // F#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [10, 0.5, 0.5, 30, 0.2, 1800, 200],
        // A#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [18, 0.5, 0.5, 30, 0.2, 1800, 200],
        // F#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [18, 0.5, 0.5, 30, 0.2, 1800, 200],
        // F#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [15, 0.5, 0.5, 30, 0.2, 1800, 200],
        // D#
        [10, 0.5, 0.5, 30, 0.2, 1800, 200],
        // A#
        [13, 0.5, 0.5, 30, 0.2, 1800, 200],
        // C#
        [8, 0.5, 0.5, 30, 0.2, 1800, 200],
        // G# (first one)
        [10, 0.5, 0.5, 30, 0.2, 1800, 200],
        // A#
        [5, 0.5, 0.5, 30, 0.2, 1800, 200],
        // E# (F)
        [8, 0.5, 0.5, 30, 0.2, 1800, 200]
        // G#
      ]
    },
    [colors.goat]: {
      currentIndex: 0,
      notes: [
        [30, 1, 1, 1, 0.2, 3e3, 1e3],
        // F#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D# 0.995 is annoying but repeated isn't too bad
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [22, 1, 1, 1, 0.2, 3e3, 1e3],
        // A#
        [30, 1, 1, 1, 0.2, 3e3, 1e3],
        // F#
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [30, 1, 1, 1, 0.2, 3e3, 1e3],
        // F#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [22, 1, 1, 1, 0.2, 3e3, 1e3],
        // A#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [30, 1, 1, 1, 0.2, 3e3, 1e3],
        // F#
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [30, 1, 1, 1, 0.2, 3e3, 1e3],
        // F#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [27, 1, 0.995, 1, 0.2, 3e3, 1e3],
        // D#
        [22, 1, 1, 1, 0.2, 3e3, 1e3],
        // A#
        [25, 1, 1, 1, 0.2, 3e3, 1e3],
        // C#
        [20, 1, 1, 1, 0.2, 3e3, 1e3],
        // G# (first one)
        [22, 1, 1, 1, 0.2, 3e3, 1e3],
        // A#
        [17, 1, 1, 1, 0.2, 3e3, 1e3],
        // E# (i.e. F. Music is weird)
        [20, 1, 1, 1, 0.2, 3e3, 1e3]
        // G#
      ]
    },
    [colors.fish]: {
      currentIndex: 0,
      notes: [
        [70, 0.1, 0.05, 900, 1, 1e3, 200],
        [73, 0.1, 0.05, 900, 1, 1e3, 200],
        [68, 0.1, 0.05, 900, 1, 1e3, 200],
        [70, 0.1, 0.05, 900, 1, 1e3, 200],
        [70, 0.1, 0.05, 900, 1, 1e3, 200],
        [73, 0.1, 0.05, 900, 1, 1e3, 200],
        [68, 0.1, 0.05, 900, 1, 1e3, 200]
      ]
    }
  };
  var playPathPlacementNote = () => {
    if (audioContext) {
      playSound(1, 0.5, 1, 0, 1, 1e3, 300, () => 2);
    }
  };
  var playPathDeleteNote = () => {
    if (audioContext) {
      playSound(1, 0.5, 1, 0, 6, 800, 1500, () => 2);
    }
  };
  var playTreeDeleteNote = () => {
    if (audioContext) {
      playSound(10, 0.1, 1, 1e3, 0.2, 1500, 500, () => 2);
    }
  };
  var playYurtSpawnNote = () => {
    if (audioContext) {
      playSound(39, 0.1, 0.25, 10, 0.2, 1e3, 100);
    }
  };
  var playOutOfPathsNote = () => {
    if (audioContext) {
      setTimeout(() => playSound(8, 0.5, 0.5, 40, 0.1, 1e3, 100), 100);
      setTimeout(() => playSound(5, 0.5, 0.5, 20, 0.1, 1e3, 100), 250);
    }
  };
  var playWarnNote = (animalType) => {
    if (audioContext) {
      const notes = warnNotes[animalType];
      const noteInfo = notes.notes[notes.currentIndex];
      notes.currentIndex = (notes.currentIndex + 1) % notes.notes.length;
      playSound(...noteInfo);
    }
  };

  // src/tree.js
  var trees = [];
  var Tree = class extends GameObject {
    constructor(properties) {
      super(__spreadValues({}, properties));
      trees.push(this);
      this.dots = [];
      this.addToSvg();
    }
    addToSvg() {
      const minDotGap = 0.5;
      const numTrees = Math.random() * 4;
      const x = gridCellSize / 2 + this.x * gridCellSize;
      const y = gridCellSize / 2 + this.y * gridCellSize;
      this.svgGroup = createSvgElement("g");
      this.svgGroup.style.transform = `translate(${x}px,${y}px)`;
      treeLayer.append(this.svgGroup);
      this.shadowGroup = createSvgElement("g");
      this.shadowGroup.style.transform = `translate(${x}px,${y}px)`;
      treeShadowLayer.append(this.shadowGroup);
      for (let i = 0; i < numTrees; i++) {
        const size = Math.random() / 2 + 1;
        const position = new factory$a(Math.random() * 8 - 4, Math.random() * 8 - 4);
        if (this.dots.some((d) => d.position.distance(position) < d.size + size + minDotGap)) {
          continue;
        }
        this.dots.push({ position, size });
        const circle = createSvgElement("circle");
        circle.style.transform = `translate(${position.x}px, ${position.y}px)`;
        circle.setAttribute("fill", colors.leaf);
        circle.style.transition = `r .4s cubic-bezier(.5, 1.5, .5, 1)`;
        setTimeout(() => circle.setAttribute("r", size), 100 * i);
        this.svgGroup.append(circle);
        const shadow = createSvgElement("ellipse");
        shadow.setAttribute("rx", 0);
        shadow.setAttribute("ry", 0);
        shadow.style.opacity = 0;
        shadow.style.transform = `translate(${position.x}px,${position.y}px) rotate(45deg)`;
        shadow.style.transition = `all .4s cubic-bezier(.5, 1.5, .5, 1)`;
        setTimeout(() => {
          shadow.setAttribute("rx", size * 1.2);
          shadow.setAttribute("ry", size * 0.9);
          shadow.style.opacity = 0.1;
          shadow.style.transform = `translate(${position.x + size * 0.7}px,${position.y + size * 0.7}px) rotate(45deg)`;
        }, 100 * i);
        this.shadowGroup.append(shadow);
      }
    }
    remove() {
      this.svgGroup.remove();
      this.shadowGroup.remove();
      for (let i = 0; i < this.dots.length; i++) {
        setTimeout(() => playTreeDeleteNote(), i * 100);
      }
      trees.splice(trees.findIndex((p) => p === this), 1);
    }
  };

  // src/path.js
  var toSvgCoord = (c) => gridCellSize / 2 + c * gridCellSize;
  var paths = [];
  var connections = [];
  var pathsData = [];
  var recentlyRemoved = [];
  var getPathsData = () => pathsData;
  var drawPaths = ({ fadeout, noShadow }) => {
    const changedPaths = paths;
    connections = [];
    changedPaths.forEach((path1) => {
      changedPaths.forEach((path2) => {
        if (path1 === path2) return;
        if (connections.find((c) => c.path1 === path2 && c.path2 === path1)) {
          return;
        }
        if (path1.noConnect || path2.noConnect) return;
        if (path1.points[0].x === path2.points[0].x && path1.points[0].y === path2.points[0].y) {
          connections.push({
            path1,
            path2,
            points: [
              path1.points[1],
              path1.points[0],
              path2.points[1]
            ]
          });
        } else if (path1.points[0].x === path2.points[1].x && path1.points[0].y === path2.points[1].y) {
          connections.push({
            path1,
            path2,
            points: [
              path1.points[1],
              path1.points[0],
              path2.points[0]
            ]
          });
        } else if (path1.points[1].x === path2.points[0].x && path1.points[1].y === path2.points[0].y) {
          connections.push({
            path1,
            path2,
            points: [
              path1.points[0],
              path1.points[1],
              path2.points[1]
            ]
          });
        } else if (path1.points[1].x === path2.points[1].x && path1.points[1].y === path2.points[1].y) {
          connections.push({
            path1,
            path2,
            points: [
              path1.points[0],
              path1.points[1],
              path2.points[0]
            ]
          });
        }
      });
    });
    const newPathsData = [];
    connections.forEach((connection) => {
      const { path1, path2, points } = connection;
      const M = `M${toSvgCoord(points[0].x)} ${toSvgCoord(points[0].y)}`;
      const Lx1 = toSvgCoord(points[0].x + (points[1].x - points[0].x) / 2);
      const Ly1 = toSvgCoord(points[0].y + (points[1].y - points[0].y) / 2);
      const L1 = `L${Lx1} ${Ly1}`;
      const Lx2 = toSvgCoord(points[2].x);
      const Ly2 = toSvgCoord(points[2].y);
      const L2 = `L${Lx2} ${Ly2}`;
      const Qx1 = toSvgCoord(points[1].x);
      const Qx2 = toSvgCoord(points[1].y);
      const Qx = toSvgCoord(points[1].x + (points[2].x - points[1].x) / 2);
      const Qy = toSvgCoord(points[1].y + (points[2].y - points[1].y) / 2);
      const Q = `Q${Qx1} ${Qx2} ${Qx} ${Qy}`;
      const start = connections.find((c) => points[0].x === c.points[1].x && points[0].y === c.points[1].y) ? `M${Lx1} ${Ly1}` : `${M}${L1}`;
      const end = connections.find((c) => points[2].x === c.points[1].x && points[2].y === c.points[1].y) ? "" : L2;
      newPathsData.push({
        path1,
        path2,
        d: `${start}${Q}${end}`
      });
    });
    changedPaths.forEach((path) => {
      const connected = connections.find((c) => c.path1 === path || c.path2 === path);
      if (!connected && !path.noConnect) {
        const { points } = path;
        const M = `${toSvgCoord(points[0].x)} ${toSvgCoord(points[0].y)}`;
        const L = `${toSvgCoord(points[1].x)} ${toSvgCoord(points[1].y)}`;
        newPathsData.push({
          path,
          d: `M${M}L${L}`,
          M,
          L
        });
      }
    });
    newPathsData.forEach((newPathData) => {
      var _a, _b, _c, _d, _e, _f, _g;
      pathsData.forEach((oldPathData) => {
        var _a2;
        const samePath = newPathData.path && newPathData.path === oldPathData.path;
        const samePath1 = newPathData.path1 && newPathData.path1 === oldPathData.path1;
        const samePath2 = newPathData.path2 && newPathData.path2 === oldPathData.path2;
        if (samePath || samePath1 && samePath2) {
          newPathData.svgElement = oldPathData.svgElement;
          newPathData.svgElementStoneShadow = oldPathData.svgElementStoneShadow;
          newPathData.svgElementShadow = oldPathData.svgElementShadow;
          if (newPathData.d !== oldPathData.d) {
            oldPathData.d = newPathData.d;
            newPathData.svgElement.setAttribute("d", newPathData.d);
            (_a2 = newPathData.svgElementStoneShadow) == null ? void 0 : _a2.setAttribute("d", newPathData.d);
          }
        }
      });
      pathsData.forEach((oldPathData) => {
        var _a2;
        if (!newPathsData.find((newPathData2) => oldPathData.d === newPathData2.d)) {
          if (oldPathData.path) {
            if (fadeout && oldPathData.path && oldPathData.path.points[0].fixed) {
              setTimeout(() => {
                var _a3;
                oldPathData.svgElement.remove();
                (_a3 = oldPathData.svgElementStoneShadow) == null ? void 0 : _a3.remove();
              }, 500);
            } else {
              oldPathData.svgElement.remove();
              (_a2 = oldPathData.svgElementStoneShadow) == null ? void 0 : _a2.remove();
            }
          }
        }
      });
      if (!newPathData.svgElement) {
        newPathData.svgElement = createSvgElement("path");
        newPathData.svgElement.setAttribute("d", newPathData.d);
        newPathData.svgElement.style.transition = `all .4s, opacity .2s`;
        if (((_a = newPathData.path) == null ? void 0 : _a.points[0].stone) || ((_b = newPathData.path) == null ? void 0 : _b.points[1].stone) || ((_c = newPathData.path1) == null ? void 0 : _c.points[0].stone) || ((_d = newPathData.path1) == null ? void 0 : _d.points[1].stone) || ((_e = newPathData.path2) == null ? void 0 : _e.points[0].stone) || ((_f = newPathData.path2) == null ? void 0 : _f.points[1].stone)) {
          newPathData.svgElement.style.strokeDasharray = "0 3px";
          newPathData.svgElement.style.strokeWidth = "2px";
          newPathData.svgElement.style.stroke = "#bbb";
          newPathData.svgElementStoneShadow = createSvgElement("path");
          newPathData.svgElementStoneShadow.setAttribute("d", newPathData.d);
          newPathData.svgElementStoneShadow.style.transition = `all .4s opacity .2s`;
          newPathData.svgElementStoneShadow.style.strokeDasharray = "0 3px";
          newPathData.svgElementStoneShadow.style.strokeWidth = "2px";
          newPathData.svgElementStoneShadow.style.stroke = colors.black;
          rockShadowLayer.append(newPathData.svgElementStoneShadow);
        }
        pathLayer.append(newPathData.svgElement);
        const pathInSameCellRecentlyRemoved = newPathData.path && recentlyRemoved.some((r) => r.x === newPathData.path.points[0].x && r.y === newPathData.path.points[0].y || r.x === newPathData.path.points[1].x && r.y === newPathData.path.points[1].y);
        const isYurtPath = (_g = newPathData.path) == null ? void 0 : _g.points[0].fixed;
        if (newPathData.path === void 0 || !pathInSameCellRecentlyRemoved || isYurtPath) {
          newPathData.svgElement.setAttribute("stroke-width", 0);
          newPathData.svgElement.setAttribute("opacity", 0);
          newPathData.svgElement.style.willChange = `stroke-width, opacity`;
          if (isYurtPath) {
            newPathData.svgElement.setAttribute("d", `M${newPathData.M}L${newPathData.M}`);
            setTimeout(() => {
              newPathData.svgElement.setAttribute("d", `M${newPathData.M}L${newPathData.L}`);
            }, 20);
          }
          if (!noShadow) {
            newPathData.svgElementShadow = createSvgElement("path");
            newPathData.svgElementShadow.setAttribute("d", newPathData.d);
            pathShadowLayer.append(newPathData.svgElementShadow);
            setTimeout(() => {
              var _a2;
              (_a2 = newPathData.svgElementShadow) == null ? void 0 : _a2.remove();
              newPathData.svgElement.style.willChange = "";
            }, 500);
          }
          setTimeout(() => {
            newPathData.svgElement.removeAttribute("stroke-width");
            newPathData.svgElement.setAttribute("opacity", 1);
          }, 20);
        }
      }
    });
    pathsData = [...newPathsData];
    recentlyRemoved = [];
  };
  var Path = class extends GameObject {
    constructor(properties) {
      const { points } = properties;
      super(__spreadProps(__spreadValues({}, properties), {
        points
      }));
      trees.filter((t) => this.points.some((p) => p.x === t.x && p.y === t.y)).forEach((tree) => tree.remove());
      paths.push(this);
    }
    remove() {
      pathsData = pathsData.filter((p) => {
        var _a, _b;
        if (p.path === this || p.path1 === this || p.path2 === this) {
          p.svgElement.setAttribute("opacity", 0);
          p.svgElement.setAttribute("stroke-width", 0);
          (_a = p.svgElementStoneShadow) == null ? void 0 : _a.setAttribute("opacity", 0);
          (_b = p.svgElementStoneShadow) == null ? void 0 : _b.setAttribute("stroke-width", 0);
          setTimeout(() => {
            var _a2;
            p.svgElement.remove();
            (_a2 = p.svgElementStoneShadow) == null ? void 0 : _a2.remove();
          }, 500);
          return false;
        }
        return true;
      });
      paths.splice(paths.findIndex((p) => p === this), 1);
      recentlyRemoved.push(
        { x: this.points[0].x, y: this.points[0].y },
        { x: this.points[1].x, y: this.points[1].y }
      );
    }
  };

  // src/inventory.js
  var inventory = {
    paths: 18
  };

  // src/cell.js
  var getBoardCell = (x, y) => {
    const cellSizePx = gridPointerLayer.getBoundingClientRect().width / boardWidth;
    return {
      x: boardOffsetX + Math.floor(x / cellSizePx),
      y: boardOffsetY + Math.floor(y / cellSizePx)
    };
  };
  var svgPxToDisplayPx = (x, y) => {
    const cellSizePx = gridPointerLayer.getBoundingClientRect().width / boardWidth;
    return {
      x: (boardOffsetX + x) * cellSizePx,
      y: (boardOffsetY + y) * cellSizePx
    };
  };
  var isPastHalfwayInto = ({ pointer, from, to }) => {
    const cellSizePx = gridPointerLayer.getBoundingClientRect().width / boardWidth;
    const fuzzyness = 4;
    const xDiff = pointer.x - cellSizePx * (from.x - boardOffsetX + 0.5);
    const yDiff = pointer.y - cellSizePx * (from.y - boardOffsetY + 0.5);
    const top = to.y - from.y < 0;
    const right = to.x - from.x > 0;
    const bottom = to.y - from.y > 0;
    const left = to.x - from.x < 0;
    const xMid = to.x === from.x;
    const yMid = to.y === from.y;
    if (top && xMid) return yDiff < -cellSizePx + fuzzyness;
    if (top && right) return xDiff - yDiff > cellSizePx * 2 - fuzzyness;
    if (yMid && right) return xDiff > cellSizePx - fuzzyness;
    if (bottom && right) return xDiff + yDiff > cellSizePx * 2 - fuzzyness;
    if (bottom && xMid) return yDiff > cellSizePx - fuzzyness;
    if (bottom && left) return xDiff + -yDiff < -cellSizePx * 2 + fuzzyness;
    if (yMid && left) return xDiff < -cellSizePx + fuzzyness;
    if (top && left) return xDiff + yDiff < -cellSizePx * 2 + fuzzyness;
    return void 0;
  };

  // src/find-route.js
  var gridData = [];
  var updateGridData = () => {
    gridData = [];
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        gridData.push({ x, y, neighbors: [] });
      }
    }
    paths.forEach((path) => {
      gridData.find((d) => d.x === path.points[0].x && d.y === path.points[0].y).neighbors.push({ x: path.points[1].x, y: path.points[1].y });
      gridData.find((d) => d.x === path.points[1].x && d.y === path.points[1].y).neighbors.push({ x: path.points[0].x, y: path.points[0].y });
    });
  };
  var breadthFirstSearch = (currentGridData, from, to) => {
    const queue = [{ node: from, path: [] }];
    const visited = [];
    while (queue.length) {
      const { node, path } = queue.shift();
      if (node === void 0) {
        return void 0;
      }
      if (to.find((t) => node.x === t.x && node.y === t.y)) {
        return path.concat(node);
      }
      const hasVisited = visited.some((visitedNode) => visitedNode.x === node.x && visitedNode.y === node.y);
      if (!hasVisited) {
        visited.push(node);
        const verticalHorizontalNeighbors = [];
        const diagonalNeighbors = [];
        node.neighbors.forEach((neighbor) => {
          if (Math.abs(neighbor.x - node.x) === 1 && neighbor.y === node.y) {
            verticalHorizontalNeighbors.push(neighbor);
          } else if (Math.abs(neighbor.y - node.y) === 1 && neighbor.x === node.x) {
            verticalHorizontalNeighbors.push(neighbor);
          } else {
            diagonalNeighbors.push(neighbor);
          }
        });
        verticalHorizontalNeighbors.forEach((neighbor) => {
          const hasVisitedNeighbor = visited.some(
            (visitedNode) => visitedNode.x === neighbor.x && visitedNode.y === neighbor.y
          );
          if (!hasVisitedNeighbor) {
            queue.push({
              node: currentGridData.find((c) => c.x === neighbor.x && c.y === neighbor.y),
              path: path.concat(__spreadProps(__spreadValues({}, node), {
                distance: 1
              }))
            });
          }
        });
        diagonalNeighbors.forEach((neighbor) => {
          const hasVisitedNeighbor = visited.some(
            (visitedNode) => visitedNode.x === neighbor.x && visitedNode.y === neighbor.y
          );
          if (!hasVisitedNeighbor) {
            queue.push({
              node: currentGridData.find((c) => c.x === neighbor.x && c.y === neighbor.y),
              path: path.concat(__spreadProps(__spreadValues({}, node), {
                distance: 1.41
                // Approx Math.sqrt(2)
              }))
            });
          }
        });
      }
    }
    return void 0;
  };
  var findRoute = ({ from, to }) => {
    const fromNode = gridData.find((c) => c.x === from.x && c.y === from.y);
    const toNodes = gridData.filter((c) => to.find((f) => c.x === f.x && c.y === f.y));
    return breadthFirstSearch(
      gridData,
      fromNode,
      toNodes
    );
  };

  // src/vector.js
  var rotateVector = (vector, angle) => new factory$a({
    x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
    y: vector.x * Math.sin(angle) - vector.y * Math.cos(angle)
  });
  var combineVectors = (vectorA, vectorB) => {
    const magnitude = vectorA.length();
    const result = vectorA.add(vectorB);
    const resultMagnitude = result.length();
    const scaledResult = result.scale(magnitude / resultMagnitude);
    return scaledResult;
  };

  // src/shuffle.js
  var shuffle = (array) => array.map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);

  // src/person.js
  var people = [];
  var Person = class extends GameObject {
    constructor(properties) {
      super(__spreadValues({}, properties));
      const xVariance = Math.random() * 2 - 1;
      const yVariance = Math.random() * 2 - 1;
      this.type = this.parent.type;
      this.atHome = true;
      this.atFarm = 0;
      this.destination = null;
      this.x = gridCellSize / 2 + this.parent.x * gridCellSize + xVariance;
      this.y = gridCellSize / 2 + this.parent.y * gridCellSize + yVariance;
      people.push(this);
    }
    addToSvg() {
      const { x } = this;
      const { y } = this;
      const person = createSvgElement("path");
      person.setAttribute("d", "M0 0 0 0");
      person.setAttribute("transform", `translate(${x},${y})`);
      person.setAttribute("stroke", this.type);
      personLayer.append(person);
      this.svgElement = person;
      const shadow = createSvgElement("path");
      shadow.setAttribute("stroke-width", 1.2);
      shadow.setAttribute("d", "M0 0 .3 .3");
      shadow.setAttribute("transform", `translate(${x},${y})`);
      yurtAndPersonShadowLayer.append(shadow);
      this.shadowElement = shadow;
    }
    render() {
      if (!this.svgElement) return;
      const { x } = this;
      const { y } = this;
      this.svgElement.setAttribute("transform", `translate(${x},${y})`);
      this.shadowElement.setAttribute("transform", `translate(${x},${y})`);
    }
    update() {
      var _a, _b;
      this.advance();
      if (this.atHome || this.atFarm) {
        this.dx *= 0.9;
        this.dy *= 0.9;
      }
      if (this.atFarm) {
        this.atFarm++;
        if (this.atFarm === 2 && this.farmToVisit.type === colors.fish) {
          shuffle(this.farmToVisit.children).forEach((fish, i) => setTimeout(() => fish.svgBody.style.fill = colors.fish, i * 250));
        }
        if (this.atFarm > 80 && this.originalRoute.length > 3 || this.atFarm > 120 && this.originalRoute.length > 2 || this.atFarm > 160) {
          if (this.farmToVisit.type === colors.fish) {
            shuffle(this.farmToVisit.children).forEach((fish, i) => setTimeout(() => fish.svgBody.style.fill = colors.shade2, 1e3 + i * 1e3));
          }
          const route = findRoute({
            from: {
              x: this.destination.x,
              // from before
              y: this.destination.y
            },
            to: [{
              x: this.parent.x,
              y: this.parent.y
            }]
          });
          if (route == null ? void 0 : route.length) {
            this.goingHome = true;
            this.atFarm = 0;
            this.hasDestination = true;
            this.destination = route.at(-1);
            this.route = route;
            this.originalRoute = [...route];
          } else {
            this.atFarm = Math.random() * 40 + 40;
          }
        }
      }
      if (this.hasDestination) {
        if (this.destination) {
          if ((_a = this.route) == null ? void 0 : _a.length) {
            const xVariance = Math.random() * 2 - 1;
            const yVariance = Math.random() * 2 - 1;
            const firstRoutePoint = new factory$a(
              gridCellSize / 2 + this.route[0].x * gridCellSize + xVariance,
              gridCellSize / 2 + this.route[0].y * gridCellSize + yVariance
            );
            const closeEnough = 2;
            const closeEnoughDestination = 1;
            if (this.originalRoute.length < 3) {
              this.dx *= 0.9;
              this.dy *= 0.9;
            }
            if (this.route.length === 1) {
              if (Math.abs(this.x - firstRoutePoint.x) < closeEnoughDestination && Math.abs(this.y - firstRoutePoint.y) < closeEnoughDestination) {
                if (this.goingHome) {
                  this.goingHome = false;
                  this.atHome = true;
                } else {
                  this.atFarm = 1;
                  this.farmToVisit.demand -= this.farmToVisit.needyness;
                  this.farmToVisit.assignedPeople.splice(this.farmToVisit.assignedPeople.indexOf(this), 1);
                }
                this.hasDestination = false;
                return;
              }
            } else if (Math.abs(this.x - firstRoutePoint.x) < closeEnough && Math.abs(this.y - firstRoutePoint.y) < closeEnough) {
              this.route.shift();
              return;
            }
            while (this.velocity.length() > 0.1) {
              this.dx *= 0.98;
              this.dy *= 0.98;
            }
            const allowedWonkyness = 6e-3;
            const speed = 0.01;
            const vectorToNextpoint = this.position.subtract(firstRoutePoint);
            const normalizedVectorToNextPoints = vectorToNextpoint.normalize();
            if (this.x < firstRoutePoint.x + allowedWonkyness) {
              this.dx -= normalizedVectorToNextPoints.x * speed;
            }
            if (this.x > firstRoutePoint.x - allowedWonkyness) {
              this.dx -= normalizedVectorToNextPoints.x * speed;
            }
            if (this.y < firstRoutePoint.y + allowedWonkyness) {
              this.dy -= normalizedVectorToNextPoints.y * speed;
            }
            if (this.y > firstRoutePoint.y - allowedWonkyness) {
              this.dy -= normalizedVectorToNextPoints.y * speed;
            }
          }
        }
      }
      const slowyDistance = 6;
      const avoidanceDistance = 1.5;
      const turnyness = 0.1;
      if (((_b = this.route) == null ? void 0 : _b.length) > 0) {
        const potentialCollisionPeople = people.filter((otherPerson) => otherPerson !== this && !otherPerson.atHome);
        potentialCollisionPeople.forEach((otherPerson) => {
          const distanceBetween = otherPerson.position.distance(this.position);
          const nextDistanceBetween = otherPerson.position.distance(this.position.add(this.velocity));
          if (nextDistanceBetween < distanceBetween) {
            if (nextDistanceBetween < avoidanceDistance) {
              const vectorBetweenPeople = this.position.subtract(otherPerson.position);
              const normalBetweenPeople = vectorBetweenPeople.normalize();
              const turnLeftVector = rotateVector(normalBetweenPeople, Math.PI / 2);
              const turnLeftVectorScaled = turnLeftVector.scale(turnyness);
              this.velocity.set(combineVectors(this.velocity, turnLeftVectorScaled));
            }
          }
          const newNextDistanceBetween = otherPerson.position.distance(
            this.position.add(this.velocity)
          );
          if (nextDistanceBetween < slowyDistance && this.velocity.length() > 0.06) {
            if (newNextDistanceBetween < distanceBetween) {
              if (nextDistanceBetween < avoidanceDistance) {
                this.dx *= 0.86;
                this.dy *= 0.86;
              } else {
                this.dx *= 0.89;
                this.dy *= 0.89;
              }
            } else {
              this.dx *= 0.9;
              this.dy *= 0.9;
            }
          }
        });
      }
    }
  };

  // src/yurt.js
  var yurts = [];
  var Yurt = class extends GameObject {
    constructor(properties) {
      const { x, y } = properties;
      super(properties);
      this.points = [{
        x: this.x,
        y: this.y
      }];
      setTimeout(() => {
        this.startPath = new Path({
          points: [
            { x, y, fixed: true },
            { x: x + this.facing.x, y: y + this.facing.y }
          ]
        });
        drawPaths({
          changedCells: [
            { x, y, fixed: true },
            { x: x + this.facing.x, y: y + this.facing.y }
          ],
          noShadow: true
        });
      }, 1e3);
      setTimeout(() => {
        this.children.push(new Person({ x: this.x, y: this.y, parent: this }));
        this.children.push(new Person({ x: this.x, y: this.y, parent: this }));
        this.children.forEach((p) => p.addToSvg());
      }, 2e3);
      setTimeout(() => {
        playYurtSpawnNote();
      }, 100);
      yurts.push(this);
      this.addToSvg();
    }
    rotateTo(x, y) {
      this.facing = {
        x: x - this.x,
        y: y - this.y
      };
      const oldPathsInPathData = getPathsData().filter((p) => p.path === this.startPath || p.path1 === this.startPath || p.path2 === this.startPath);
      oldPathsInPathData.forEach((p) => {
        p.svgElement.setAttribute("stroke-width", 0);
        p.svgElement.setAttribute("opacity", 0);
        setTimeout(() => {
          p.svgElement.remove();
        }, 500);
      });
      if (this.startPath) {
        this.oldStartPath = this.startPath;
        this.oldStartPath.noConnect = true;
      }
      this.startPath = new Path({
        points: [
          { x: this.x, y: this.y, fixed: true },
          { x, y }
        ]
      });
      drawPaths({ changedCells: [{ x: this.x, y: this.y, fixed: true }, { x, y }], fadeout: true });
      setTimeout(() => {
        var _a;
        (_a = this.oldStartPath) == null ? void 0 : _a.remove();
      }, 400);
    }
    addToSvg() {
      const x = gridCellSize / 2 + this.x * gridCellSize;
      const y = gridCellSize / 2 + this.y * gridCellSize;
      const baseShadow = createSvgElement("circle");
      baseShadow.setAttribute("fill", colors.shade);
      baseShadow.setAttribute("r", 0);
      baseShadow.setAttribute("stroke", "none");
      baseShadow.setAttribute("transform", `translate(${x},${y})`);
      baseShadow.style.willChange = `r, opacity`;
      baseShadow.style.opacity = 0;
      baseShadow.style.transition = `all .4s`;
      baseLayer.append(baseShadow);
      setTimeout(() => {
        baseShadow.setAttribute("r", 3);
        baseShadow.style.opacity = 1;
      }, 100);
      setTimeout(() => baseShadow.style.willChange = "", 600);
      this.svgGroup = createSvgElement("g");
      this.svgGroup.style.transform = `translate(${x}px,${y}px)`;
      yurtLayer.append(this.svgGroup);
      this.circle = createSvgElement("circle");
      this.circle.style.transition = "r.4s";
      this.circle.style.willChange = "r";
      setTimeout(() => this.circle.setAttribute("r", 3), 400);
      setTimeout(() => this.circle.style.willChange = "", 900);
      this.shadow = createSvgElement("path");
      this.shadow.setAttribute("d", "M0 0 0 0");
      this.shadow.setAttribute("stroke-width", 6);
      this.shadow.style.transform = `translate(${x}px,${y}px)`;
      this.shadow.style.opacity = 0;
      this.shadow.style.willChange = "d";
      this.shadow.style.transition = "d.6s";
      yurtAndPersonShadowLayer.append(this.shadow);
      setTimeout(() => this.shadow.style.opacity = 0.8, 800);
      setTimeout(() => this.shadow.setAttribute("d", "M0 0 2 2"), 900);
      setTimeout(() => this.shadow.style.willChange = "", 1600);
      this.decoration = createSvgElement("circle");
      this.decoration.setAttribute("fill", "none");
      this.decoration.setAttribute("r", 1);
      this.decoration.setAttribute("stroke-dasharray", 6.3);
      this.decoration.setAttribute("stroke-dashoffset", 6.3);
      this.decoration.setAttribute("stroke", this.type);
      this.decoration.style.willChange = "stroke-dashoffset";
      this.decoration.style.transition = `stroke-dashoffset .5s`;
      this.svgGroup.append(this.circle, this.decoration);
      setTimeout(() => this.decoration.setAttribute("stroke-dashoffset", 0), 700);
      setTimeout(() => this.decoration.style.willChange = "", 1300);
    }
    lift() {
      const x = gridCellSize / 2 + this.x * gridCellSize;
      const y = gridCellSize / 2 + this.y * gridCellSize;
      this.shadow.style.transition = "transform.2s d.3s";
      this.shadow.setAttribute("d", "M0 0l3 3");
      this.svgGroup.style.transition = "transform.2s";
      this.svgGroup.style.transform = `translate(${x}px,${y}px) scale(1.1)`;
    }
    place() {
      const x = gridCellSize / 2 + this.x * gridCellSize;
      const y = gridCellSize / 2 + this.y * gridCellSize;
      this.shadow.style.transition = "transform.3s d.4s";
      this.shadow.setAttribute("d", "M0 0 2 2");
      this.shadow.style.transform = `translate(${x}px,${y}px) scale(1)`;
      this.svgGroup.style.transition = "transform.3s";
      this.svgGroup.style.transform = `translate(${x}px,${y}px) scale(1)`;
    }
  };

  // src/ox-emoji.js
  var emojiOx = () => {
    const svg = createSvgElement();
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("stroke-linecap", "round");
    const body = createSvgElement("path");
    body.setAttribute("fill", colors.ox);
    body.setAttribute("d", "M15 2h-4c-1 0-5 0-6 2l-2 5c-1 2 0 5 2 5h4l2 2z");
    const horn = createSvgElement("path");
    horn.setAttribute("fill", colors.oxHorn);
    horn.setAttribute("d", "M12 3c-2 2-5-1-7-1s-3-.5-3-1c0-.5 2-1 4-1s8 1 6 3z");
    const eye = createSvgElement("path");
    eye.setAttribute("d", "m8 6 0 0");
    eye.setAttribute("stroke-width", 2);
    eye.setAttribute("stroke", colors.ui);
    svg.append(body, horn, eye);
    return svg;
  };

  // src/goat-emoji.js
  var emojiGoat = () => {
    const svg = createSvgElement();
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("stroke-linecap", "round");
    svg.style.width = "48px";
    svg.style.height = "48px";
    const body = createSvgElement("path");
    body.setAttribute("fill", colors.goat);
    body.setAttribute("d", "M18 12c-2-3-4-8-7-8-4 0-10 5-10 9 0 3 6 3 8 3l2 4z");
    const horn1 = createSvgElement("path");
    horn1.setAttribute("fill", "#bcc");
    horn1.setAttribute("d", "M7.4 7.5c-1-4 3.7-6 8-4 1 .4 1 1.3 0 1-3-1-6 1-4 4 1.1 1.6-3.2 2-4-1z");
    const horn2 = createSvgElement("path");
    horn2.setAttribute("fill", "#cdd");
    horn2.setAttribute("d", "M6 5.8c-1-4 3.7-6 8-4 1 .4 1 1.3 0 1-3-1-6 1-4 4 1.1 1.6-3.2 2-4-1z");
    const beard = createSvgElement("path");
    beard.setAttribute("fill", "#cdd");
    beard.setAttribute("d", "M6 15c0 4-2 5-2 4 0-2-1 0-1-1v-3z");
    const eye = createSvgElement("path");
    eye.setAttribute("d", "m7 9.3 0 0");
    eye.setAttribute("stroke-width", 2);
    eye.setAttribute("stroke", colors.ui);
    svg.append(horn1, horn2, beard, body, eye);
    return svg;
  };

  // src/fish-emoji.js
  var emojiFish = () => {
    const svg = createSvgElement();
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("stroke-linecap", "round");
    const body = createSvgElement("path");
    body.setAttribute("fill", colors.fish);
    body.setAttribute("d", "m17 11 1-4c1-4-5 0-5 4s6 8 5 4zM4 6.5c0-2 2-4 2-4 4 0 7 4 8 8m-11 4c4 2 14 6 6-2");
    const fins = createSvgElement("path");
    fins.setAttribute("fill", colors.fish);
    fins.setAttribute("d", "m0 11c0 10 16 4 16 0s-16-12-16 0");
    const eye = createSvgElement("path");
    eye.setAttribute("d", "m4 9 0 0");
    eye.setAttribute("stroke-width", 2);
    eye.setAttribute("stroke", colors.ui);
    svg.append(fins, body, eye);
    return svg;
  };

  // src/ui.js
  var uiContainer = createElement();
  var oxCounterWrapper = createElement();
  var oxCounter = createElement();
  var goatCounterWrapper = createElement();
  var goatCounter = createElement();
  var fishCounterWrapper = createElement();
  var fishCounter = createElement();
  var scoreCounters = createElement();
  var clock = createElement();
  var clockMonth = createElement();
  var pathTilesIndicator = createElement();
  var pathTilesIndicatorCount = createElement();
  var pauseButton = createElement("button");
  var pauseSvgPath = createSvgElement("path");
  var clockHand = createSvgElement("path");
  var gridToggleButton = createElement("button");
  var gridToggleSvg = createSvgElement("svg");
  var gridToggleSvgPath = createSvgElement("path");
  var gridToggleTooltip = createElement();
  var gridRedToggleButton = createElement("button");
  var gridRedToggleSvg = createSvgElement("svg");
  var gridRedToggleSvgPath = createSvgElement("path");
  var gridRedToggleTooltip = createElement();
  var soundToggleButton = createElement("button");
  var soundToggleSvg = createSvgElement("svg");
  var soundToggleSvgPath = createSvgElement("path");
  var soundToggleSvgPathX = createSvgElement("path");
  var soundToggleTooltip = createElement();
  var initUi = () => {
    const styles = createElement("style");
    styles.innerText = `
    body {
      position: relative;
      font-weight: 700;
      font-family: system-ui;
      color: ${colors.ui};
      margin: 0;
      width: 100vw;
      height: 100vh;
      user-select: none;
    }
    button {
      font-weight: 700;
      font-family: system-ui;
      color: ${colors.ui};
      border: none;
      padding: 0 20px;
      font-size: 32px;
      height: 56px;
      border-radius: 64px;
      background: ${colors.yurt};
      transition: all .2s, bottom .5s, right .5s, opacity 1s;
      box-shadow: 0 0 0 1px ${colors.shade};
    }
    button:hover {
      box-shadow: 4px 4px 0 1px ${colors.shade};
    }
    button:active {
      transform: scale(.95);
      box-shadow: 0 0 0 1px ${colors.shade};
    }
    u, abbr {
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
    }
  `;
    document.head.append(styles);
    uiContainer.style.cssText = `
    position: absolute;
    inset: 0;
    display: grid;
    overflow: hidden;
    pointer-events: none
  `;
    uiContainer.style.zIndex = 1;
    document.body.append(uiContainer);
    scoreCounters.style.cssText = `display:flex;position:absolute;top:16px;left:16px;`;
    scoreCounters.style.transition = `opacity 1s`;
    scoreCounters.style.opacity = 0;
    oxCounterWrapper.style.cssText = `display:flex;align-items:center;gap:8px;transition:width 1s,opacity 1s 1s`;
    const oxCounterEmoji = emojiOx();
    oxCounterWrapper.style.width = 0;
    oxCounterWrapper.style.opacity = 0;
    oxCounterEmoji.style.width = "48px";
    oxCounterEmoji.style.height = "48px";
    oxCounterWrapper.append(oxCounterEmoji, oxCounter);
    goatCounterWrapper.style.cssText = `display:flex;align-items:center;gap:8px;transition:width 1s,opacity 1s 1s`;
    const goatCounterEmoji = emojiGoat();
    goatCounterWrapper.style.width = 0;
    goatCounterWrapper.style.opacity = 0;
    goatCounterEmoji.style.width = "48px";
    goatCounterEmoji.style.height = "48px";
    goatCounterWrapper.append(goatCounterEmoji, goatCounter);
    fishCounterWrapper.style.cssText = `display:flex;align-items:center;gap:8px;transition:width 1s,opacity 1s 1s`;
    const fishCounterEmoji = emojiFish();
    fishCounterWrapper.style.width = 0;
    fishCounterWrapper.style.opacity = 0;
    fishCounterEmoji.style.width = "48px";
    fishCounterEmoji.style.height = "48px";
    fishCounterWrapper.append(fishCounterEmoji, fishCounter);
    scoreCounters.append(oxCounterWrapper, goatCounterWrapper, fishCounterWrapper);
    clock.style.cssText = `
    position: absolute;
    display: grid;
    top: 16px;
    right: 16px;
    place-items: center;
    border-radius: 64px;
    background: ${colors.ui}
  `;
    clock.style.width = "80px";
    clock.style.height = "80px";
    clock.style.opacity = 0;
    clock.style.transition = `opacity 1s`;
    const clockSvg = createSvgElement("svg");
    clockSvg.setAttribute("stroke-linejoin", "round");
    clockSvg.setAttribute("stroke-linecap", "round");
    clockSvg.setAttribute("viewBox", "0 0 16 16");
    clockSvg.style.width = "80px";
    clockSvg.style.height = "80px";
    for (let i = 75; i < 350; i += 25) {
      const dot = createSvgElement("path");
      dot.setAttribute("fill", "none");
      dot.setAttribute("stroke", "#eee");
      dot.setAttribute("transform-origin", "center");
      dot.setAttribute("d", "m8 14.5 0 0");
      dot.style.transform = `rotate(${i}grad)`;
      clockSvg.append(dot);
    }
    clockHand.setAttribute("stroke", "#eee");
    clockHand.setAttribute("transform-origin", "center");
    clockHand.setAttribute("d", "m8 4 0 4");
    clockSvg.append(clockHand);
    clockMonth.style.cssText = `position:absolute;bottom:8px;color:#eee`;
    clock.append(clockSvg, clockMonth);
    pathTilesIndicator.style.cssText = `
    position: absolute;
    display: grid;
    place-items: center;
    place-self: center;
    bottom: 20px;
    border-radius: 20px;
    background: ${colors.ui};
  `;
    if (document.body.scrollHeight < 500) {
      pathTilesIndicator.style.left = "20px";
    } else {
      pathTilesIndicator.style.left = "";
    }
    addEventListener("resize", () => {
      if (document.body.scrollHeight < 500) {
        pathTilesIndicator.style.left = "20px";
      } else {
        pathTilesIndicator.style.left = "";
      }
    });
    pathTilesIndicator.style.transform = "rotate(-45deg)";
    pathTilesIndicator.style.opacity = 0;
    pathTilesIndicator.style.transition = `scale .4s cubic-bezier(.5, 2, .5, 1), opacity 1s`;
    pathTilesIndicator.style.width = "72px";
    pathTilesIndicator.style.height = "72px";
    pathTilesIndicatorCount.style.cssText = `
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 64px;
    border: 6px solid ${colors.ui};
    transform: translate(28px,28px) rotate(45deg);
    font-size: 18px;
    background: #eee;
    transition: all.5s;
  }`;
    pathTilesIndicatorCount.style.width = "28px";
    pathTilesIndicatorCount.style.height = "28px";
    const pathTilesSvg = createSvgElement("svg");
    pathTilesSvg.setAttribute("viewBox", "0 0 18 18");
    pathTilesSvg.style.width = "54px";
    pathTilesSvg.style.height = "54px";
    pathTilesSvg.style.transform = "rotate(45deg)";
    const pathTilesSvgPath = createSvgElement("path");
    pathTilesSvgPath.setAttribute("fill", "none");
    pathTilesSvgPath.setAttribute("stroke", "#eee");
    pathTilesSvgPath.setAttribute("stroke-linecap", "round");
    pathTilesSvgPath.setAttribute("stroke-width", 2);
    pathTilesSvgPath.setAttribute("d", "M11 1h-3q-2 0-2 2t2 2h4q2 0 2 2t-2 2h-6q-2 0-2 2t2 2h4q2 0 2 2t-2 2h-3");
    pathTilesSvg.append(pathTilesSvgPath);
    pathTilesIndicator.append(pathTilesSvg, pathTilesIndicatorCount);
    const pauseSvg = createSvgElement("svg");
    pauseSvg.setAttribute("viewBox", "0 0 16 16");
    pauseSvg.setAttribute("width", 64);
    pauseSvg.setAttribute("height", 64);
    pauseSvgPath.setAttribute("fill", colors.ui);
    pauseSvgPath.setAttribute("stroke", colors.ui);
    pauseSvgPath.setAttribute("stroke-width", 2);
    pauseSvgPath.setAttribute("stroke-linecap", "round");
    pauseSvgPath.setAttribute("stroke-linejoin", "round");
    pauseSvgPath.setAttribute("d", "M6 6 6 10M10 6 10 8 10 10");
    pauseSvgPath.style.transition = `all .2s`;
    pauseSvgPath.style.transformOrigin = "center";
    pauseSvgPath.style.transform = "rotate(180deg)";
    pauseSvg.append(pauseSvgPath);
    pauseButton.style.cssText = `position:absolute;padding:0;pointer-events:all`;
    if (document.body.scrollHeight < 500) {
      pauseButton.style.top = "108px";
      pauseButton.style.right = "20px";
    } else {
      pauseButton.style.top = "24px";
      pauseButton.style.right = "112px";
    }
    addEventListener("resize", () => {
      if (document.body.scrollHeight < 500) {
        pauseButton.style.top = "108px";
        pauseButton.style.right = "20px";
      } else {
        pauseButton.style.top = "24px";
        pauseButton.style.right = "112px";
      }
    });
    pauseButton.style.width = "64px";
    pauseButton.style.height = "64px";
    pauseButton.style.opacity = 0;
    pauseButton.append(pauseSvg);
    gridRedToggleSvg.setAttribute("viewBox", "0 0 16 16");
    gridRedToggleSvg.setAttribute("width", 48);
    gridRedToggleSvg.setAttribute("height", 48);
    gridRedToggleSvgPath.setAttribute("fill", "none");
    gridRedToggleSvgPath.setAttribute("stroke", colors.red);
    gridRedToggleSvgPath.setAttribute("stroke-width", 2);
    gridRedToggleSvgPath.setAttribute("stroke-linecap", "round");
    gridRedToggleSvgPath.setAttribute("stroke-linejoin", "round");
    gridRedToggleSvgPath.style.transition = `all .3s`;
    gridRedToggleSvgPath.style.transformOrigin = "center";
    gridRedToggleSvg.append(gridRedToggleSvgPath);
    gridRedToggleButton.append(gridRedToggleSvg);
    gridRedToggleButton.style.cssText = `position:absolute;bottom:72px;right:16px;padding:0;pointer-events:all;`;
    gridRedToggleButton.style.width = "48px";
    gridRedToggleButton.style.height = "48px";
    gridRedToggleTooltip.style.cssText = `
    position: absolute;
    display: flex;
    right: 16px;
    align-items: center;
    color: #eee;
    font-size: 16px;
    border-radius: 64px;
    padding: 0 64px 0 16px;
    white-space: pre;
    pointer-events: all;
    bottom: 72px;
    background: ${colors.ui};
  `;
    gridRedToggleTooltip.style.height = "48px";
    gridRedToggleTooltip.style.width = "96px";
    gridRedToggleTooltip.style.transition = `all .5s`;
    gridToggleSvg.setAttribute("viewBox", "0 0 16 16");
    gridToggleSvg.setAttribute("width", 48);
    gridToggleSvg.setAttribute("height", 48);
    gridToggleSvgPath.setAttribute("fill", "none");
    gridToggleSvgPath.setAttribute("stroke", colors.ui);
    gridToggleSvgPath.setAttribute("stroke-width", 2);
    gridToggleSvgPath.setAttribute("stroke-linecap", "round");
    gridToggleSvgPath.setAttribute("stroke-linejoin", "round");
    gridToggleSvgPath.style.transition = `all .3s`;
    gridToggleSvgPath.style.transformOrigin = "center";
    gridToggleSvg.append(gridToggleSvgPath);
    gridToggleButton.append(gridToggleSvg);
    gridToggleButton.style.cssText = `position:absolute;bottom:16px;right:16px;padding:0;pointer-events:all;`;
    gridToggleButton.style.width = "48px";
    gridToggleButton.style.height = "48px";
    gridToggleTooltip.style.cssText = `
    position: absolute;
    display: flex;
    right: 16px;
    align-items: center;
    color: #eee;
    font-size: 16px;
    border-radius: 64px;
    padding: 0 64px 0 16px;
    white-space: pre;
    pointer-events: all;
    bottom: 16px;
    background: ${colors.ui};
  `;
    gridToggleTooltip.style.height = "48px";
    gridToggleTooltip.style.width = "96px";
    gridToggleTooltip.style.transition = `all .5s`;
    soundToggleSvg.setAttribute("viewBox", "0 0 16 16");
    soundToggleSvg.setAttribute("width", 48);
    soundToggleSvg.setAttribute("height", 48);
    soundToggleSvgPath.setAttribute("fill", "none");
    soundToggleSvgPath.setAttribute("stroke", colors.ui);
    soundToggleSvgPath.setAttribute("stroke-width", 2);
    soundToggleSvgPath.setAttribute("stroke-linecap", "round");
    soundToggleSvgPath.setAttribute("stroke-linejoin", "round");
    soundToggleSvgPath.style.transition = `all .3s`;
    soundToggleSvgPath.style.transformOrigin = "center";
    soundToggleSvgPath.style.transform = "rotate(0)";
    soundToggleSvgPath.setAttribute("d", "M9 13 6 10 4 10 4 6 6 6 9 3");
    soundToggleSvgPathX.setAttribute("fill", "none");
    soundToggleSvgPathX.setAttribute("stroke", colors.ui);
    soundToggleSvgPathX.setAttribute("stroke-width", 2);
    soundToggleSvgPathX.setAttribute("stroke-linecap", "round");
    soundToggleSvgPathX.setAttribute("stroke-linejoin", "round");
    soundToggleSvgPathX.style.transition = `all .3s`;
    soundToggleSvgPathX.style.transformOrigin = "center";
    soundToggleSvgPathX.style.transform = "rotate(0)";
    soundToggleSvg.append(soundToggleSvgPath, soundToggleSvgPathX);
    soundToggleButton.append(soundToggleSvg);
    soundToggleButton.style.cssText = `position:absolute;bottom:128px;right:16px;padding:0;pointer-events:all;`;
    soundToggleButton.style.width = "48px";
    soundToggleButton.style.height = "48px";
    soundToggleTooltip.style.cssText = `
    position: absolute;
    display: flex;
    right: 16px;
    align-items: center;
    color: #eee;
    font-size: 16px;
    border-radius: 64px;
    padding: 0 64px 0 16px;
    white-space: pre;
    pointer-events: all;
    bottom: 128px;
    background: ${colors.ui};
  `;
    soundToggleTooltip.style.height = "48px";
    soundToggleTooltip.style.width = "96px";
    soundToggleTooltip.style.transition = `all .5s`;
    uiContainer.append(
      scoreCounters,
      clock,
      pauseButton,
      pathTilesIndicator,
      gridRedToggleTooltip,
      gridRedToggleButton,
      gridToggleTooltip,
      gridToggleButton,
      soundToggleTooltip,
      soundToggleButton
    );
  };

  // src/remove-path.js
  var removePath = (x, y) => {
    const pathsToRemove = paths.filter((path) => (path.points[0].x === x && path.points[0].y === y || path.points[1].x === x && path.points[1].y === y) && // Don't remove "fixed" paths i.e. under yurts
    (!path.points[0].fixed && !path.points[1].fixed));
    pathsToRemove.forEach((pathToRemove) => {
      if (inventory.paths < 99) {
        inventory.paths++;
        pathTilesIndicatorCount.innerText = inventory.paths;
      }
      pathToRemove.remove();
    });
    if (pathsToRemove.length) playPathDeleteNote();
    drawPaths({ changedCells: [{ x, y }] });
  };

  // src/hull.js
  function orientation(p, q, r) {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (val === 0) return 0;
    return val > 0 ? 1 : 2;
  }
  var getOutlinePoints = (points) => {
    let leftmost = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[leftmost].y || points[i].y === points[leftmost].y && points[i].x < points[leftmost].x) {
        leftmost = i;
      }
    }
    const hull = [];
    let p = leftmost;
    do {
      hull.push(points[p]);
      let q = (p + 1) % points.length;
      for (let i = 0; i < points.length; i++) {
        if (orientation(points[p], points[i], points[q]) === 2) {
          q = i;
        }
      }
      p = q;
    } while (p !== leftmost);
    p = leftmost;
    do {
      let q = (p - 1 + points.length) % points.length;
      for (let i = 0; i < points.length; i++) {
        if (orientation(points[p], points[i], points[q]) === 2) {
          q = i;
        }
      }
      p = q;
      if (p !== leftmost) {
        hull.push(points[p]);
      }
    } while (p !== leftmost);
    return hull;
  };

  // src/pond.js
  var ponds = [];
  var createPondShape = (width, height) => {
    const points = [];
    for (let h = -height / 2 + 0.5; h <= height / 2 - 0.5; h++) {
      for (let w = -width / 2 + 0.5; w <= width / 2 - 0.5; w++) {
        if (width / 2 - Math.abs(w) + Math.random() * 2 - 1 > Math.abs(h)) {
          points.push({ x: Math.floor(w), y: Math.floor(h) });
        }
      }
    }
    if (points.length > 2) return points;
    return createPondShape(width, height);
  };
  var spawnPond = ({
    width,
    height,
    x,
    y
  }) => {
    let points = createPondShape(width, height);
    const avoidancePoints = [];
    points = points.map((p) => ({
      x: x + p.x + Math.floor(width / 2),
      y: y + p.y + Math.floor(height / 2)
    }));
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        avoidancePoints.push({
          x: x + w,
          y: y + h
        });
      }
    }
    ponds.push({
      width,
      height,
      x,
      y,
      points,
      avoidancePoints
    });
    const outline = getOutlinePoints(points);
    const pondSvg = createSvgElement("path");
    pondSvg.setAttribute("fill", "#69b");
    const d = outline.reduce((acc, curr, index) => {
      const next = outline.at((index + 1) % outline.length);
      const end = {
        x: curr.x + (next.x - curr.x) / 2,
        y: curr.y + (next.y - curr.y) / 2
      };
      return `${acc} ${gridCellSize / 2 + curr.x * gridCellSize} ${gridCellSize / 2 + curr.y * gridCellSize} ${gridCellSize / 2 + end.x * gridCellSize} ${gridCellSize / 2 + end.y * gridCellSize}`;
    }, `M${gridCellSize / 2 + (outline[0].x + (outline.at(-1).x - outline[0].x) / 2) * gridCellSize} ${gridCellSize / 2 + (outline[0].y + (outline.at(-1).y - outline[0].y) / 2) * gridCellSize}Q`);
    pondSvg.setAttribute("d", `${d}Z`);
    pondSvg.setAttribute("stroke-width", 4);
    pondSvg.setAttribute("stroke-linejoin", "round");
    pondSvg.setAttribute("stroke", "#6ab");
    const pondShadeSvg = createSvgElement("path");
    pondShadeSvg.setAttribute("fill", "#7bc");
    pondShadeSvg.setAttribute("d", `${d}Z`);
    pondShadeSvg.setAttribute("stroke", "#7bc");
    pondShadeSvg.style.filter = "blur(2px)";
    const pondEdgeSvg = createSvgElement("path");
    pondEdgeSvg.setAttribute("d", `${d}Z`);
    pondEdgeSvg.setAttribute("stroke-width", 6);
    pondEdgeSvg.setAttribute("stroke", "#9b6");
    pondLayer.append(pondEdgeSvg, pondSvg, pondShadeSvg);
  };

  // src/grid-toggle.js
  var gridLocked = localStorage.getItem("Tiny Yurtsg") === "true";
  var gridRedState = {
    locked: false,
    on: false
  };
  var gridShow = () => {
    svgHazardLines.style.opacity = 0.9;
    gridRect.style.opacity = 1;
    if (!gridLocked) {
      gridToggleSvgPath.setAttribute("d", "M6 5 6 11M10 5 10 11M5 6 8 6 11 6M5 10 11 10");
      gridToggleSvgPath.style.transform = "rotate(180deg)";
    }
  };
  var gridHide = () => {
    if (!gridLocked) {
      svgHazardLines.style.opacity = 0;
      gridRect.style.opacity = 0;
      gridToggleSvgPath.setAttribute("d", "M8 4.5 5 11M8 4.5 11 11M5 11 8 4.5 11 11M6 9.5 10 9.5");
      gridToggleSvgPath.style.transform = "rotate(0)";
    }
  };
  if (gridLocked) {
    gridToggleTooltip.innerHTML = "Grid: <u>On";
    gridShow();
    gridToggleSvgPath.setAttribute("d", "M6 5 6 11M10 5 10 11M5 6 8 6 11 6M5 10 11 10");
    gridToggleSvgPath.style.transform = "rotate(180deg)";
  } else {
    gridToggleTooltip.innerHTML = "Grid: <u>Auto";
    gridHide();
  }
  var gridLockToggle = () => {
    initAudio();
    if (gridLocked) {
      gridLocked = false;
      gridHide();
      localStorage.setItem("Tiny Yurtsg", false);
      gridToggleTooltip.innerHTML = "Grid: <u>Auto";
    } else {
      gridShow();
      localStorage.setItem("Tiny Yurtsg", true);
      gridLocked = true;
      gridToggleTooltip.innerHTML = "Grid: <u>On";
    }
    playSound(25, 1, 1, 1, 0.3, 1e3, 1e3);
  };
  var gridRedShow = () => {
    gridPointerLayer.style.cursor = "crosshair";
    gridRectRed.style.opacity = 0.9;
    svgHazardLinesRed.style.opacity = 0.9;
    if (!gridRedState.locked) {
      gridRedToggleSvgPath.setAttribute(
        "d",
        "M4.5 4.5Q4.5 4.5 11.5 4.5 11.5 4.5 11.5 4.5 11.5 11.5 11.5 11.5 11.5 11.5 11.5 11.5 4.5 11.5 4.5 11.5ZM9 7 7 9M7 7Q9 9 9 9"
      );
      gridRedToggleSvgPath.style.transform = "rotate(180deg)";
    }
  };
  var gridRedHide = () => {
    if (!gridRedState.locked) {
      gridRectRed.style.opacity = 0;
      svgHazardLinesRed.style.opacity = 0;
      gridRedToggleSvgPath.setAttribute("d", "M5 7Q5 4 8 4 11 4 11 7 11 8 11 9 11 12 8 12 5 12 5 9ZM8 4 8 8 M8 8 Q11 8 11 7.5");
      gridRedToggleSvgPath.style.transform = "rotate(0)";
    }
  };
  if (gridRedState.locked) {
    gridRedToggleTooltip.innerHTML = "Delete: <u>On";
    gridRedToggleSvgPath.setAttribute(
      "d",
      "M4.5 4.5 Q4.5 4.5 11.5 4.5 11.5 4.5 11.5 4.5 11.5 11.5 11.5 11.5 11.5 11.5 11.5 11.5 4.5 11.5 4.5 11.5ZM9 7 7 9M7 7Q9 9 9 9"
    );
    gridRedToggleSvgPath.style.transform = "rotate(180deg)";
  } else {
    gridRedToggleTooltip.innerHTML = 'Delete: <abbr title="Right Mouse Button">RMB';
    gridRedToggleSvgPath.setAttribute("d", "M5 7Q5 4 8 4 11 4 11 7 11 8 11 9 11 12 8 12 5 12 5 9ZM8 4 8 8 M8 8 Q11 8 11 7.5");
    gridRedToggleSvgPath.style.transform = "rotate(0)";
  }
  var gridRedLockToggle = () => {
    initAudio();
    if (gridRedState.locked) {
      gridRedState.locked = false;
      gridRedHide();
      gridRedToggleTooltip.innerHTML = 'Delete: <abbr title="Right Mouse Button">RMB';
    } else {
      gridRedShow();
      gridRedState.locked = true;
      gridRedToggleTooltip.innerHTML = "Delete: <u>On";
    }
    playSound(27, 1, 1, 1, 0.3, 1e3, 1e3);
  };

  // src/pointer.js
  // Touch pointermove often reports buttons=0; treat a primary finger as a
  // left-drag so a path can actually be drawn on a phone. Mouse is unchanged.
  var isDraw = (event) => event.buttons === 1 || (event.pointerType === "touch" || event.pointerType === "pen") && event.type !== "pointerup" && event.type !== "pointercancel";
  var px = (event) => event.clientX != null ? event.clientX : event.x;
  var py = (event) => event.clientY != null ? event.clientY : event.y;
  var dragStartCell = {};
  var isDragging = false;
  var yurtInCell = (x, y) => yurts.find((yurt) => yurt.x === x && yurt.y === y);
  var pondInCell = (x, y) => ponds.find((pond) => pond.points.find((p) => p.x === x && p.y === y));
  var pondPathInCell = (x, y) => paths.find((path) => path.points[1].x === x && path.points[1].y === y && path.points[1].stone);
  var samePathInBothCell = (x0, y0, x1, y1) => paths.find((path) => path.points[0].x === x0 && path.points[0].y === y0 && (path.points[1].x === x1 && path.points[1].y === y1) || path.points[1].x === x0 && path.points[1].y === y0 && (path.points[0].x === x1 && path.points[0].y === y1));
  var toSvgCoord2 = (c) => gridCellSize / 2 + c * gridCellSize;
  var pathDragIndicatorWrapper = createSvgElement("g");
  var pathDragIndicator = createSvgElement("path");
  pathDragIndicator.style.opacity = 0;
  pathDragIndicator.style.scale = 0;
  pathDragIndicator.style.transition = `all.2s, scale.4s cubic-bezier(.5,2,.5,1)`;
  pathDragIndicatorWrapper.append(pathDragIndicator);
  pathShadowLayer.append(pathDragIndicatorWrapper);
  var handlePointerdown = (event) => {
    event.stopPropagation();
    try { gridPointerLayer.setPointerCapture(event.pointerId); } catch (e) {}
    if (typeof event.preventDefault === "function") event.preventDefault();
    const rect = gridPointerLayer.getBoundingClientRect();
    const { x: cellX, y: cellY } = getBoardCell(px(event) - rect.left, py(event) - rect.top);
    if (isDraw(event) && !gridRedState.locked) {
      gridShow();
      const pondInStartCell = pondInCell(cellX, cellY);
      const pondPathInStartCell = pondPathInCell(cellX, cellY);
      if (pondInStartCell && !pondPathInStartCell) return;
      isDragging = true;
      dragStartCell = { x: cellX, y: cellY };
      const yurtInStartCell = yurtInCell(dragStartCell.x, dragStartCell.y);
      if (yurtInStartCell) {
        yurtInStartCell.lift();
        gridPointerLayer.style.cursor = "grabbing";
      } else {
        pathDragIndicator.setAttribute("d", "M0 0l0 0");
        pathDragIndicatorWrapper.setAttribute("transform", `translate(${toSvgCoord2(cellX)} ${toSvgCoord2(cellY)})`);
        pathDragIndicator.style.opacity = 1;
        pathDragIndicator.style.scale = 1.3;
        pathDragIndicator.style.transition = `all.2s, scale.4s cubic-bezier(.5,2,.5,1)`;
      }
    } else if (event.buttons === 2 || gridRedState.locked) {
      gridRedShow();
      removePath(cellX, cellY);
    }
  };
  var handleHazardPointerdown = () => {
    gridRedShow();
  };
  var handleHazardPointermove = (event) => {
    if (event.buttons !== 1) return;
    gridRedShow();
    gridHide();
  };
  var handleHazardPointerup = () => {
    gridRedHide();
  };
  var handlePointerup = (event) => {
    event.stopPropagation();
    const rect = gridPointerLayer.getBoundingClientRect();
    const { x: cellX, y: cellY } = getBoardCell(px(event) - rect.left, py(event) - rect.top);
    const yurtInStartCell = yurtInCell(dragStartCell.x, dragStartCell.y);
    const yurtInEndCell = yurtInCell(cellX, cellY);
    const pondInStartCell = pondInCell(cellX, cellY);
    const pondPathInStartCell = pondPathInCell(cellX, cellY);
    if (pondInStartCell && !pondPathInStartCell) {
      gridPointerLayer.style.cursor = "not-allowed";
    } else if (yurtInEndCell) {
      gridPointerLayer.style.cursor = "grab";
    } else {
      gridPointerLayer.style.cursor = "cell";
    }
    gridHide();
    gridRedHide();
    pathDragIndicator.style.opacity = 0;
    pathDragIndicator.style.scale = 0;
    if (yurtInStartCell) {
      yurtInStartCell.place();
    }
    dragStartCell = {};
    isDragging = false;
  };
  var handlePointermove = (event) => {
    event.stopPropagation();
    const rect = gridPointerLayer.getBoundingClientRect();
    const { x: cellX, y: cellY } = getBoardCell(px(event) - rect.left, py(event) - rect.top);
    if (event.buttons === 2 || isDraw(event) && gridRedState.locked) {
      gridRedShow();
      removePath(cellX, cellY);
      return;
    }
    const yurtInStartCell = yurtInCell(dragStartCell.x, dragStartCell.y);
    const yurtInEndCell = yurtInCell(cellX, cellY);
    const pondInStartCell = pondInCell(cellX, cellY);
    const pondPathInStartCell = pondPathInCell(cellX, cellY);
    if (pondInStartCell && !pondPathInStartCell) {
      gridPointerLayer.style.cursor = "not-allowed";
      return;
    }
    if (yurtInEndCell && !isDraw(event)) {
      gridPointerLayer.style.cursor = "grab";
    } else if (isDraw(event) && (yurtInStartCell && yurtInEndCell || yurtInStartCell && !yurtInEndCell)) {
      gridPointerLayer.style.cursor = "grabbing";
    } else if (!samePathInBothCell(dragStartCell.x, dragStartCell.y, cellX, cellY)) {
      gridPointerLayer.style.cursor = "cell";
    }
    if (!isDraw(event)) return;
    gridRedHide();
    gridShow();
    if (!isDragging) return;
    const xDiff = cellX - dragStartCell.x;
    const yDiff = cellY - dragStartCell.y;
    const dragStartSvgPx = new factory$a({
      x: toSvgCoord2(dragStartCell.x),
      y: toSvgCoord2(dragStartCell.y)
    });
    const L = `${toSvgCoord2(xDiff / 2 - 0.5)} ${toSvgCoord2(yDiff / 2 - 0.5)}`;
    pathDragIndicatorWrapper.setAttribute("transform", `translate(${dragStartSvgPx.x} ${dragStartSvgPx.y})`);
    pathDragIndicator.setAttribute("d", `M0 0L${L}`);
    pathDragIndicator.style.opacity = 1;
    pathDragIndicator.style.scale = 1.3;
    if (xDiff === 0 && yDiff === 0 || Math.abs(xDiff) > 1 || Math.abs(yDiff) > 1) {
      pathDragIndicator.setAttribute("d", "M0 0L0 0");
      return;
    }
    pathDragIndicator.style.transition = `all.2s, scale.4s cubic-bezier(.5,2,.5,1)`;
    pathDragIndicator.style.scale = 1;
    if (!isPastHalfwayInto({
      pointer: { x: px(event) - rect.left, y: py(event) - rect.top },
      from: { x: dragStartCell.x, y: dragStartCell.y },
      to: { x: cellX, y: cellY }
    })) return;
    if (yurtInStartCell && !yurtInEndCell) {
      yurtInStartCell.rotateTo(cellX, cellY);
      dragStartCell = { x: cellX, y: cellY };
      playPathPlacementNote();
      yurtInStartCell.place();
      pathDragIndicator.style.transition = "";
      return;
    }
    if (yurtInEndCell && !yurtInStartCell) {
      yurtInEndCell.rotateTo(dragStartCell.x, dragStartCell.y);
      dragStartCell = {};
      isDragging = false;
      playPathPlacementNote();
      yurtInEndCell.place();
      return;
    }
    if (yurtInStartCell && yurtInEndCell) {
      return;
    }
    if (inventory.paths <= 0) {
      pathTilesIndicator.style.scale = 1.1;
      pathTilesIndicatorCount.innerText = "!";
      playOutOfPathsNote();
      setTimeout(() => {
        pathTilesIndicator.style.scale = 1;
        pathTilesIndicatorCount.innerText = inventory.paths;
      }, 300);
      pathDragIndicator.style.opacity = 0;
      dragStartCell = {};
      isDragging = false;
      return;
    }
    if (samePathInBothCell(dragStartCell.x, dragStartCell.y, cellX, cellY)) {
      gridPointerLayer.style.cursor = "not-allowed";
      return;
    }
    playPathPlacementNote();
    const newPath = new Path({
      points: [
        { x: dragStartCell.x, y: dragStartCell.y },
        { x: cellX, y: cellY }
      ]
    });
    inventory.paths--;
    pathTilesIndicatorCount.innerText = inventory.paths;
    drawPaths({
      changedCells: [
        { x: dragStartCell.x, y: dragStartCell.y },
        { x: cellX, y: cellY }
      ],
      newPath
    });
    dragStartCell = { x: cellX, y: cellY };
    pathDragIndicator.style.transition = "";
  };
  var initPointer = () => {
    svgContainerElement.addEventListener("pointerdown", handleHazardPointerdown);
    svgContainerElement.addEventListener("pointermove", handleHazardPointermove);
    svgContainerElement.addEventListener("pointerup", handleHazardPointerup);
    svgContainerElement.addEventListener("contextmenu", (event) => event.preventDefault());
    gridPointerLayer.addEventListener("pointerdown", handlePointerdown);
    gridPointerLayer.addEventListener("pointermove", handlePointermove);
    gridPointerLayer.addEventListener("pointerup", handlePointerup);
  };

  // src/animal.js
  var animals = [];
  var padding = 3;
  var getRandom = (range) => padding + Math.random() * (range * gridCellSize - padding * 2);
  var Animal = class extends GameObject {
    constructor(properties) {
      var _a, _b, _c, _d, _e, _f;
      super(__spreadProps(__spreadValues({}, properties), {
        anchor: { x: 0.5, y: 0.5 },
        x: getRandom((_b = (_a = properties.parent) == null ? void 0 : _a.width) != null ? _b : 0),
        y: getRandom((_d = (_c = properties.parent) == null ? void 0 : _c.height) != null ? _d : 0),
        rotation: (_e = properties.rotation) != null ? _e : Math.random() * Math.PI * 4 - Math.PI * 2
      }));
      const x = this.parent.x * gridCellSize + this.x;
      const y = this.parent.y * gridCellSize + this.y;
      this.isBaby = (_f = properties.isBaby) != null ? _f : false;
      this.roundness = properties.roundness;
      this.hasWarn = false;
      this.hasPerson = null;
      this.pinSvg = createSvgElement("g");
      this.pinSvg.style.opacity = 0;
      this.pinSvg.style.willChange = `opacity, transform`;
      this.pinSvg.style.transition = `all .8s cubic-bezier(.5, 2, .5, 1)`;
      this.pinSvg.style.transformOrigin = "bottom";
      this.pinSvg.style.transformBox = "fill-box";
      this.pinSvg.style.transform = `translate(${x}px, ${y - this.height / 2}px)`;
      pinLayer.append(this.pinSvg);
      const pinBubble = createSvgElement("path");
      pinBubble.setAttribute("fill", "#fff");
      pinBubble.setAttribute("d", "m6 6-2-2a3 3 0 1 1 4 0Z");
      pinBubble.setAttribute("transform", "scale(.5) translate(-6 -8)");
      this.pinSvg.append(pinBubble);
      this.warnSvg = createSvgElement("path");
      this.warnSvg.setAttribute("stroke", this.color);
      this.warnSvg.setAttribute("d", "M3 6 3 6M3 4.5 3 3");
      this.warnSvg.setAttribute("transform", "scale(.5) translate(-3 -10.4)");
      this.warnSvg.style.opacity = 0;
      this.pinSvg.append(this.warnSvg);
      this.loveSvg = createSvgElement("path");
      this.loveSvg.setAttribute("fill", this.color);
      this.loveSvg.setAttribute("d", "M6 6 4 4A1 1 0 1 1 6 2 1 1 0 1 1 8 4Z");
      this.loveSvg.setAttribute("transform", "scale(.3) translate(-6 -13)");
      this.loveSvg.style.opacity = 0;
      this.pinSvg.append(this.loveSvg);
      animals.push(this);
    }
    render() {
      const x = this.parent.x * gridCellSize + this.x;
      const y = this.parent.y * gridCellSize + this.y;
      this.pinSvg.style.transform = `
      translate(${x}px, ${y - this.height / 2}px)
      scale(${this.hasWarn || this.hasLove ? 1 : 0})
    `;
    }
    getRandomTarget() {
      const randomTarget = {
        x: getRandom(this.parent.width),
        y: getRandom(this.parent.height)
      };
      return randomTarget;
    }
    showLove() {
      this.hasLove = true;
      this.pinSvg.style.opacity = 1;
      this.warnSvg.style.opacity = 0;
      this.loveSvg.style.opacity = 1;
    }
    hideLove() {
      this.hasLove = false;
      this.pinSvg.style.opacity = this.hasWarn ? 1 : 0;
      this.warnSvg.style.opacity = this.hasWarn ? 1 : 0;
      this.loveSvg.style.opacity = 0;
    }
    showWarn() {
      playWarnNote(this.color);
      this.hasWarn = true;
      this.warnSvg.style.opacity = 1;
      this.loveSvg.style.opacity = 0;
      this.pinSvg.style.opacity = 1;
    }
    hideWarn() {
      this.hasWarn = false;
      this.loveSvg.style.opacity = this.hasLove ? 1 : 0;
      this.pinSvg.style.opacity = this.hasLove ? 1 : 0;
      this.warnSvg.style.opacity = 0;
    }
    toggleWarn(toggle) {
      if (toggle) {
        this.showWarn();
      } else {
        this.hideWarn();
      }
    }
  };

  // src/ox.js
  var oxen = [];
  var Ox = class extends Animal {
    constructor(properties) {
      super(__spreadProps(__spreadValues({}, properties), {
        parent: properties.parent,
        width: 1.5,
        height: 2.5,
        roundness: 0.6,
        color: colors.ox,
        isBaby: properties.isBaby ? 5e3 : false
      }));
      oxen.push(this);
    }
    addToSvg() {
      this.scale = 0;
      const ox = createSvgElement("g");
      ox.style.transformOrigin = "center";
      ox.style.transformBox = "fill-box";
      ox.style.transition = `all 1s`;
      ox.style.willChange = "transform";
      this.svgElement = ox;
      animalLayer.prepend(ox);
      const body = createSvgElement("rect");
      body.setAttribute("fill", colors.ox);
      body.setAttribute("width", this.width);
      body.setAttribute("height", this.height);
      body.setAttribute("rx", this.roundness);
      ox.append(body);
      const horns = createSvgElement("path");
      horns.setAttribute("fill", "none");
      horns.setAttribute("stroke", colors.oxHorn);
      horns.setAttribute("width", this.width);
      horns.setAttribute("height", this.height);
      horns.setAttribute("d", "M0 2Q0 1 1 1Q2 1 2 2");
      horns.setAttribute("transform", "translate(-0.2 .6)");
      horns.setAttribute("stroke-width", 0.4);
      if (this.isBaby) {
        horns.style.transition = `all 1s`;
        horns.style.willChange = "opacity";
        horns.style.opacity = 0;
      }
      this.svgHorns = horns;
      ox.append(horns);
      const shadow = createSvgElement("rect");
      shadow.setAttribute("width", this.width);
      shadow.setAttribute("height", this.height);
      shadow.setAttribute("rx", this.roundness);
      shadow.style.transformOrigin = "center";
      shadow.style.transformBox = "fill-box";
      shadow.style.transition = `all 1s`;
      shadow.style.willChange = "transform";
      this.svgShadowElement = shadow;
      animalShadowLayer.prepend(shadow);
      this.render();
      oxCounterWrapper.style.width = "96px";
      oxCounterWrapper.style.opacity = "1";
      setTimeout(() => {
        this.scale = 1;
        oxCounter.innerText = oxen.length;
      }, 500);
      setTimeout(() => {
        ox.style.transition = "";
        ox.style.willChange = "";
        shadow.style.willChange = "";
        shadow.style.transition = "";
      }, 1500);
    }
    update(gameStarted2) {
      this.advance();
      if (gameStarted2) {
        if (this.isBaby === 1) {
          this.svgHorns.style.opacity = 1;
        }
        if (this.isBaby) {
          this.isBaby--;
        }
      }
      if (Math.random() > 0.99) {
        this.target = this.getRandomTarget();
      }
      if (this.target) {
        const angle = angleToTarget(this, this.target);
        const angleDiff = angle - this.rotation;
        const targetVector = factory$a(this.target);
        const dist = targetVector.distance(this) > 1;
        if (Math.abs(angleDiff % (Math.PI * 2)) > 0.1) {
          this.rotation += angleDiff > 0 ? 0.04 : -0.04;
        } else if (dist > 0.1) {
          const normalized = targetVector.subtract(this).normalize();
          const newPosX = this.x + normalized.x * 0.05;
          const newPosY = this.y + normalized.y * 0.05;
          const tooCloseToOtherOxes = this.parent.children.some((o) => {
            if (this === o) return false;
            const otherOxVector = factory$a(o);
            const oldDistToOtherOx = otherOxVector.distance({ x: this.x, y: this.y });
            const newDistToOtherOx = otherOxVector.distance({ x: newPosX, y: newPosY });
            return newDistToOtherOx < 4 && newDistToOtherOx < oldDistToOtherOx;
          });
          if (!tooCloseToOtherOxes) {
            this.x = newPosX;
            this.y = newPosY;
          }
        }
      }
    }
    render() {
      super.render();
      const x = this.parent.x * gridCellSize + this.x - this.width / 2;
      const y = this.parent.y * gridCellSize + this.y - this.height / 2;
      this.svgElement.style.transform = `
      translate(${x}px, ${y}px)
      rotate(${radToDeg(this.rotation) - 90}deg)
      scale(${this.scale * (this.isBaby ? 0.5 : 1)})
    `;
      this.svgShadowElement.style.transform = `
      translate(${x}px, ${y}px)
      rotate(${radToDeg(this.rotation) - 90}deg)
      scale(${(this.scale + 0.04) * (this.isBaby ? 0.5 : 1)})
    `;
    }
  };

  // src/farm.js
  var farms = [];
  var roundness = 2;
  var fenceLineThickness = 1;
  var Farm = class extends GameObject {
    constructor(properties) {
      var _a;
      const { relativePathPoints } = properties;
      super(properties);
      this.delay = (_a = this.delay) != null ? _a : 0;
      this.demand = 0;
      this.totalUpdates = 0;
      this.circumference = this.width * gridCellSize * 2 + this.height * gridCellSize * 2;
      this.numIssues = 0;
      this.assignedPeople = [];
      this.points = [];
      for (let w = 0; w < this.width; w++) {
        for (let h = 0; h < this.height; h++) {
          this.points.push({ x: this.x + w, y: this.y + h });
        }
      }
      if (relativePathPoints) {
        setTimeout(() => {
          this.startPath = new Path({
            points: [
              {
                x: this.x + relativePathPoints[0].x,
                y: this.y + relativePathPoints[0].y,
                fixed: relativePathPoints[0].fixed,
                stone: relativePathPoints[0].stone
              },
              {
                x: this.x + relativePathPoints[1].x,
                y: this.y + relativePathPoints[1].y,
                fixed: relativePathPoints[1].fixed,
                stone: relativePathPoints[1].stone
              }
            ]
          });
          drawPaths({});
        }, 1500 + properties.delay);
      }
      farms.push(this);
      setTimeout(() => {
        this.addToSvg();
      }, properties.delay);
    }
    addAnimal(animal) {
      this.addChild(animal);
      animal.addToSvg();
    }
    assignWarn() {
      const adults = this.children.filter((c) => !c.isBaby);
      const notWarnedAnimals = adults.filter((c) => !c.hasWarn);
      const warnedAnimals = adults.filter((c) => c.hasWarn);
      if (this.hasWarn) {
        if (this.numIssues <= adults.length) {
          this.hideWarn();
        } else {
          this.children.forEach((c) => c.hideWarn());
        }
      } else {
        this.toggleWarn(this.numIssues > adults.length);
        if (warnedAnimals.length && this.numIssues < warnedAnimals.length) {
          warnedAnimals[Math.floor(Math.random() * warnedAnimals.length)].hideWarn();
        }
        if (notWarnedAnimals.length && this.numIssues > adults.length - notWarnedAnimals.length) {
          notWarnedAnimals[Math.floor(Math.random() * notWarnedAnimals.length)].showWarn();
        }
      }
    }
    update(gameStarted2, updateCount2) {
      if (this.appearing) return;
      if (gameStarted2) {
        this.numIssues = Math.floor(this.demand / this.needyness);
        this.demand += this.children.length - 1 + updateCount2 * updateCount2 / 1e9;
        if (this.hasWarn) {
          this.updateWarn();
        }
        this.assignWarn();
      }
      this.children.forEach((animal) => animal.update(gameStarted2));
      for (let i = 0; i < this.numIssues; i++) {
        if (this.assignedPeople.length >= this.numIssues) return;
        const atHomePeopleOfSameType = people.filter((person) => person.atHome && person.type === this.type);
        if (atHomePeopleOfSameType.length === 0) return;
        let closestPerson = atHomePeopleOfSameType[0];
        let bestRoute = null;
        for (let j = 0; j < atHomePeopleOfSameType.length; j++) {
          const thisRoute = findRoute({
            from: {
              x: atHomePeopleOfSameType[j].parent.x,
              y: atHomePeopleOfSameType[j].parent.y
            },
            to: this.points
          });
          if (!bestRoute) {
            bestRoute = thisRoute;
            closestPerson = atHomePeopleOfSameType[j];
          }
          if (thisRoute && thisRoute.length < bestRoute.length) {
            bestRoute = thisRoute;
            closestPerson = atHomePeopleOfSameType[j];
          }
          if (thisRoute && thisRoute.length === bestRoute.length) {
            if (atHomePeopleOfSameType[j].parent !== closestPerson.parent) {
              const bestDistance = bestRoute.reduce((acc, curr) => {
                var _a;
                return acc + ((_a = curr.distance) != null ? _a : 0);
              }, 0);
              const thisDistance = thisRoute.reduce((acc, curr) => {
                var _a;
                return acc + ((_a = curr.distance) != null ? _a : 0);
              }, 0);
              if (thisDistance < bestDistance) {
                bestRoute = thisRoute;
                closestPerson = atHomePeopleOfSameType[j];
              }
            }
          }
        }
        if (bestRoute) {
          closestPerson.destination = bestRoute.at(-1);
          closestPerson.hasDestination = true;
          closestPerson.route = bestRoute;
          closestPerson.originalRoute = [...bestRoute];
          closestPerson.atHome = false;
          this.assignedPeople.push(closestPerson);
          closestPerson.farmToVisit = this;
        }
      }
    }
    render() {
      this.children.forEach((animal) => animal.render());
    }
    addToSvg() {
      const x = this.x * gridCellSize + fenceLineThickness / 2 + gridLineThickness2 / 2;
      const y = this.y * gridCellSize + fenceLineThickness / 2 + gridLineThickness2 / 2;
      const svgWidth = gridCellSize * this.width - fenceLineThickness - gridLineThickness2;
      const svgHeight = gridCellSize * this.height - fenceLineThickness - gridLineThickness2;
      if (this.type !== colors.fish) {
        const gridBlock = createSvgElement("rect");
        gridBlock.style.width = svgWidth;
        gridBlock.style.height = svgHeight;
        gridBlock.setAttribute("rx", roundness);
        gridBlock.setAttribute("transform", `translate(${x},${y})`);
        gridBlock.style.opacity = 0;
        gridBlock.style.transition = "opacity.8s";
        gridBlock.style.willChange = "opacity";
        gridBlock.setAttribute("fill", colors.grass);
        gridBlockLayer.append(gridBlock);
        setTimeout(() => gridBlock.style.opacity = 1, 1e3);
        setTimeout(() => gridBlock.style.willChange = "", 2e3);
      }
      const fence = createSvgElement("rect");
      fence.setAttribute("width", svgWidth);
      fence.setAttribute("height", svgHeight);
      fence.setAttribute("rx", roundness);
      fence.setAttribute("transform", `translate(${x},${y})`);
      fence.setAttribute("stroke", this.fenceColor);
      fence.setAttribute("stroke-dasharray", this.circumference);
      fence.setAttribute("stroke-dashoffset", this.circumference);
      fence.style.transition = `all 1s`;
      fenceLayer.append(fence);
      const shadow = createSvgElement("rect");
      shadow.setAttribute("width", svgWidth);
      shadow.setAttribute("height", svgHeight);
      shadow.setAttribute("rx", roundness);
      shadow.style.transform = `translate(${x - 0.5}px,${y - 0.5}px)`;
      shadow.style.willChange = "stroke-dashoffset, transform";
      shadow.setAttribute("stroke-dasharray", this.circumference);
      shadow.setAttribute("stroke-dashoffset", this.circumference);
      shadow.style.transition = `stroke-dashoffset 1s, transform .5s`;
      fenceShadowLayer.append(shadow);
      setTimeout(() => {
        fence.setAttribute("stroke-dashoffset", 0);
        shadow.setAttribute("stroke-dashoffset", 0);
      }, 100);
      setTimeout(() => {
        shadow.style.transform = `translate(${x}px,${y}px)`;
      }, 1e3);
      this.pinSvg = createSvgElement("g");
      this.pinSvg.translate = `${x + svgWidth / 2}px, ${y + svgHeight / 2 + 1.5}px`;
      this.pinSvg.style.willChange = `opacity, transform`;
      this.pinSvg.style.transition = `all .8s cubic-bezier(.5, 2, .5, 1)`;
      this.pinSvg.style.transformOrigin = "bottom";
      this.pinSvg.style.transformBox = "fill-box";
      this.pinSvg.style.opacity = 0;
      this.pinSvg.style.transform = `translate(${this.pinSvg.translate}) scale(0)`;
      pinLayer.append(this.pinSvg);
      this.pinBubble = createSvgElement("path");
      this.pinBubble.setAttribute("fill", "#fff");
      this.pinBubble.setAttribute("d", "m6 6-2-2a3 3 0 1 1 4 0Z");
      this.pinBubble.setAttribute("transform", "translate(-9 -9) scale(1.5)");
      this.pinSvg.append(this.pinBubble);
      this.warnCircleBg = createSvgElement("circle");
      this.warnCircleBg.setAttribute("fill", "none");
      this.warnCircleBg.setAttribute("stroke-width", "2");
      this.warnCircleBg.setAttribute("stroke-linecap", "square");
      this.warnCircleBg.setAttribute("r", 2);
      this.warnCircleBg.setAttribute("stroke", colors.ui);
      this.warnCircleBg.setAttribute("opacity", 0.2);
      this.warnCircleBg.setAttribute("transform", "scale(1.2) translate(0 -5.3)");
      this.pinSvg.append(this.warnCircleBg);
      this.warnCircle = createSvgElement("circle");
      this.warnCircle.setAttribute("fill", "none");
      this.warnCircle.setAttribute("stroke-width", "2");
      this.warnCircle.setAttribute("stroke-linecap", "butt");
      this.warnCircle.setAttribute("r", 2);
      this.warnCircle.setAttribute("stroke", colors.red);
      this.warnCircle.style.willChange = "stroke-dashoffset";
      this.warnCircle.style.transition = "stroke-dashoffset.5s";
      this.warnCircle.setAttribute("stroke-dasharray", 12.56);
      this.warnCircle.setAttribute("stroke-dashoffset", 12.56);
      this.warnCircle.style.transition = "stroke-dashoffset.3s.1s";
      this.warnCircle.setAttribute("transform", "scale(1.2) translate(0 -5.3) rotate(-90)");
      this.pinSvg.append(this.warnCircle);
      this.pinSvg.style.opacity = 1;
    }
    showWarn() {
      this.hasWarn = true;
      this.pinSvg.style.opacity = 1;
      this.warnCircle.style.transition = "stroke-dashoffset.4s.8s";
      this.pinSvg.style.transform = `translate(${this.pinSvg.translate}) scale(1)`;
      this.pinSvg.style.transition = `all .8s cubic-bezier(.5,2,.5,1)`;
      playWarnNote(this.type);
      setTimeout(() => {
        this.warnCircle.style.transition = "stroke-dashoffset.4s";
      }, 1e3);
    }
    hideWarn() {
      this.hasWarn = false;
      this.pinSvg.style.opacity = 0;
      this.warnCircle.style.transition = `stroke-dashoffset .3s`;
      this.pinSvg.style.transform = `translate(${this.pinSvg.translate}) scale(0)`;
      this.pinSvg.style.transition = `all .8s cubic-bezier(.5, 2, .5, 1) .4s`;
    }
    toggleWarn(toggle) {
      if (toggle) {
        this.showWarn();
      } else {
        this.hideWarn();
      }
    }
    updateWarn() {
      const fullCircle = 12.56;
      const adults = this.children.filter((c) => !c.isBaby);
      const maxOverflow = adults.length * 2;
      const numOverflowIssues = this.numIssues - adults.length;
      const dashoffset = fullCircle - fullCircle / maxOverflow * numOverflowIssues;
      this.warnCircle.setAttribute("stroke-dashoffset", dashoffset);
      if (this.prevNumOverflowIssues < numOverflowIssues) {
        playWarnNote(this.type);
        this.pinSvg.style.transform = `translate(${this.pinSvg.translate}) scale(1.2)`;
        setTimeout(() => {
          this.pinSvg.style.transform = `translate(${this.pinSvg.translate}) scale(1)`;
        }, 200);
      }
      this.prevNumOverflowIssues = numOverflowIssues;
      if (numOverflowIssues === maxOverflow) {
        this.isAlive = false;
      }
    }
  };

  // src/ox-farm.js
  var oxFarms = [];
  var OxFarm = class extends Farm {
    constructor(properties) {
      super(__spreadProps(__spreadValues({}, properties), {
        fenceColor: colors.ox
      }));
      this.needyness = 225;
      this.type = colors.ox;
      oxFarms.push(this);
      const isBaby = (oxFarms.length - 1) % 2;
      setTimeout(() => this.addAnimal({}), 2e3 + properties.delay);
      setTimeout(() => this.addAnimal({}), 3e3 + properties.delay);
      setTimeout(() => this.addAnimal({ isBaby }), 4e3 + properties.delay);
      this.numAnimals = 3;
      this.appearing = true;
      setTimeout(() => this.appearing = false, 3e3);
    }
    upgrade() {
      if (this.numAnimals >= 5) {
        return false;
      }
      this.numAnimals += 2;
      for (let i = 0; i < this.children.filter((c) => !c.isBaby).length; i++) {
        setTimeout(() => this.children.filter((c) => !c.isBaby)[i].showLove(), i * 1e3);
        setTimeout(() => this.children.filter((c) => !c.isBaby)[i].hideLove(), 7e3);
        if (i) setTimeout(() => this.addAnimal({ isBaby: true }), i * 1e3 + 7e3);
      }
      return true;
    }
    addAnimal({ isBaby = false }) {
      super.addAnimal(new Ox({
        parent: this,
        isBaby
      }));
    }
    update(gameStarted2, updateCount2) {
      super.update(gameStarted2, updateCount2);
    }
  };

  // src/goat.js
  var goats = [];
  var Goat = class extends Animal {
    constructor(properties) {
      super(__spreadProps(__spreadValues({}, properties), {
        parent: properties.parent,
        width: 1,
        height: 1.5,
        roundness: 0.6,
        color: colors.goat,
        isBaby: properties.isBaby ? 4e3 : false
      }));
      goats.push(this);
    }
    addToSvg() {
      this.scale = 0;
      const goat = createSvgElement("g");
      goat.style.transformOrigin = "center";
      goat.style.transformBox = "fill-box";
      goat.style.transition = `all 1s`;
      goat.style.willChange = "transform";
      this.svgElement = goat;
      animalLayer.prepend(goat);
      const body = createSvgElement("rect");
      body.setAttribute("fill", colors.goat);
      body.setAttribute("width", this.width);
      body.setAttribute("height", this.height);
      body.setAttribute("rx", this.roundness);
      goat.append(body);
      const shadow = createSvgElement("rect");
      shadow.setAttribute("width", this.width);
      shadow.setAttribute("height", this.height);
      shadow.setAttribute("rx", this.roundness);
      shadow.style.transformOrigin = "center";
      shadow.style.transformBox = "fill-box";
      shadow.style.transition = `all 1s`;
      shadow.style.willChange = "transform";
      this.svgShadowElement = shadow;
      animalShadowLayer.prepend(shadow);
      this.render();
      goatCounterWrapper.style.width = "96px";
      goatCounterWrapper.style.opacity = "1";
      setTimeout(() => {
        this.scale = 1;
        goatCounter.innerText = goats.length;
      }, 500);
      setTimeout(() => {
        goat.style.transition = "";
        goat.style.willChange = "";
        shadow.style.willChange = "";
        shadow.style.transition = "";
      }, 1500);
    }
    update(gameStarted2) {
      this.advance();
      if (gameStarted2) {
        if (this.isBaby) {
          this.isBaby--;
        }
      }
      if (Math.random() > 0.96) {
        this.target = this.getRandomTarget();
      }
      if (this.target) {
        const angle = angleToTarget(this, this.target);
        const angleDiff = angle - this.rotation;
        const targetVector = factory$a(this.target);
        const dist = targetVector.distance(this) > 1;
        if (Math.abs(angleDiff % (Math.PI * 2)) > 0.1) {
          this.rotation += angleDiff > 0 ? 0.1 : -0.1;
        } else if (dist > 0.1) {
          const normalized = targetVector.subtract(this).normalize();
          const newPosX = this.x + normalized.x * 0.1;
          const newPosY = this.y + normalized.y * 0.1;
          const tooCloseToOtherOxes = this.parent.children.some((o) => {
            if (this === o) return false;
            const otherOxVector = factory$a(o);
            const oldDistToOtherOx = otherOxVector.distance({ x: this.x, y: this.y });
            const newDistToOtherOx = otherOxVector.distance({ x: newPosX, y: newPosY });
            return newDistToOtherOx < 4 && newDistToOtherOx < oldDistToOtherOx;
          });
          if (!tooCloseToOtherOxes) {
            this.x = newPosX;
            this.y = newPosY;
          }
        }
      }
    }
    render() {
      super.render();
      const x = this.parent.x * gridCellSize + this.x - this.width / 2;
      const y = this.parent.y * gridCellSize + this.y - this.height / 2;
      this.svgElement.style.transform = `
      translate(${x}px, ${y}px)
      rotate(${radToDeg(this.rotation) - 90}deg)
      scale(${this.scale * (this.isBaby ? 0.6 : 1)})
    `;
      this.svgShadowElement.style.transform = `
      translate(${x}px, ${y}px)
      rotate(${radToDeg(this.rotation) - 90}deg)
      scale(${(this.scale + 0.04) * (this.isBaby ? 0.6 : 1)})
    `;
    }
  };

  // src/goat-farm.js
  var goatFarms = [];
  var GoatFarm = class extends Farm {
    constructor(properties) {
      super(__spreadProps(__spreadValues({}, properties), {
        fenceColor: colors.goat
      }));
      this.needyness = 240;
      this.type = colors.goat;
      goatFarms.push(this);
      setTimeout(() => this.addAnimal({}), 2e3);
      setTimeout(() => this.addAnimal({}), 3e3);
      setTimeout(() => this.addAnimal({ isBaby: (goatFarms.length - 1) % 2 }), 4e3);
      this.numAnimals = 3;
      this.appearing = true;
      setTimeout(() => this.appearing = false, 3e3);
    }
    upgrade() {
      this.numAnimals += 1;
      if (this.numAnimals >= 7) {
        return false;
      }
      for (let i = 0; i < 2; i++) {
        setTimeout(() => this.children.filter((c) => !c.isBaby)[i].showLove(), i * 1e3);
        setTimeout(() => this.children.filter((c) => !c.isBaby)[i].hideLove(), 7e3);
        if (i) setTimeout(() => this.addAnimal({ isBaby: true }), i * 1e3 + 7e3);
      }
      return true;
    }
    addAnimal({ isBaby = false }) {
      super.addAnimal(new Goat({
        parent: this,
        isBaby
      }));
    }
    update(gameStarted2, updateCount2) {
      super.update(gameStarted2, updateCount2);
    }
  };

  // src/fish.js
  var fishes = [];
  var Fish = class extends Animal {
    constructor(properties) {
      super(__spreadProps(__spreadValues({}, properties), {
        parent: properties.parent,
        width: 0.7,
        height: 1,
        roundness: 1,
        color: colors.fish
      }));
      fishes.push(this);
    }
    addToSvg() {
      this.scale = 0;
      this.svgElement = createSvgElement("g");
      this.svgElement.style.transformOrigin = "center";
      this.svgElement.style.transformBox = "fill-box";
      this.svgElement.style.transition = `all 1s`;
      this.svgElement.style.willChange = "transform";
      animalLayer.append(this.svgElement);
      this.svgBody = createSvgElement("rect");
      this.svgBody.setAttribute("fill", colors.fish);
      this.svgBody.setAttribute("width", this.width);
      this.svgBody.setAttribute("height", this.height);
      this.svgBody.setAttribute("rx", this.roundness);
      this.svgBody.style.transition = `fill .2s`;
      this.svgElement.append(this.svgBody);
      this.render();
      fishCounterWrapper.style.width = "96px";
      fishCounterWrapper.style.opacity = 1;
      setTimeout(() => {
        this.scale = 1;
        fishCounter.innerText = fishes.length;
      }, 500);
      setTimeout(() => {
        this.svgElement.style.transition = "";
        this.svgElement.style.willChange = "";
      }, 1500);
      setTimeout(() => {
        this.svgBody.setAttribute("fill", colors.shade2);
      }, 4e3);
    }
    update(gameStarted2) {
      this.advance();
      if (gameStarted2) {
        if (this.isBaby) {
          this.isBaby--;
        }
      }
      if (Math.random() > 0.96) {
        this.target = this.getRandomTarget();
      }
      if (this.target) {
        const angle = angleToTarget(this, this.target);
        const angleDiff = angle - this.rotation;
        const targetVector = factory$a(this.target);
        const dist = targetVector.distance(this) > 1;
        if (Math.abs(angleDiff % (Math.PI * 2)) > 0.1) {
          this.rotation += angleDiff > 0 ? 0.1 : -0.1;
        } else if (dist > 0.1) {
          const normalized = targetVector.subtract(this).normalize();
          const newPosX = this.x + normalized.x * 0.1;
          const newPosY = this.y + normalized.y * 0.1;
          const tooCloseToOtherOxes = this.parent.children.some((o) => {
            if (this === o) return false;
            const otherOxVector = factory$a(o);
            const oldDistToOtherOx = otherOxVector.distance({ x: this.x, y: this.y });
            const newDistToOtherOx = otherOxVector.distance({ x: newPosX, y: newPosY });
            return newDistToOtherOx < 4 && newDistToOtherOx < oldDistToOtherOx;
          });
          if (!tooCloseToOtherOxes) {
            this.x = newPosX;
            this.y = newPosY;
          }
        }
      }
    }
    render() {
      super.render();
      const x = this.parent.x * gridCellSize + this.x - this.width / 2;
      const y = this.parent.y * gridCellSize + this.y - this.height / 2;
      this.svgElement.style.transform = `
      translate(${x}px, ${y}px)
      rotate(${radToDeg(this.rotation) - 90}deg)
      scale(${this.scale * (this.isBaby ? 0.6 : 1)})
    `;
      if (this.hasWarn) {
        this.svgBody.style.fill = colors.fish;
      }
    }
  };

  // src/fish-farm.js
  var fishFarms = [];
  var FishFarm = class extends Farm {
    constructor(properties) {
      var _a, _b, _c, _d, _e;
      super(__spreadProps(__spreadValues({}, properties), {
        fenceColor: "#eee",
        width: 2,
        height: 2
      }));
      this.needyness = 1300;
      this.type = colors.fish;
      fishFarms.push(this);
      setTimeout(() => this.addAnimal({}), 2e3 + ((_a = properties.delay) != null ? _a : 0));
      setTimeout(() => this.addAnimal({}), 2500 + ((_b = properties.delay) != null ? _b : 0));
      setTimeout(() => this.addAnimal({}), 3e3 + ((_c = properties.delay) != null ? _c : 0));
      setTimeout(() => this.addAnimal({}), 3500 + ((_d = properties.delay) != null ? _d : 0));
      setTimeout(() => this.addAnimal({}), 4e3 + ((_e = properties.delay) != null ? _e : 0));
      this.numAnimals = 5;
      this.appearing = true;
      setTimeout(() => this.appearing = false, 3e3);
    }
    upgrade() {
      if (this.numAnimals >= 9) {
        return false;
      }
      this.numAnimals += 4;
      for (let i = 0; i < 2; i++) {
        setTimeout(() => this.children[i].showLove(), i * 1e3);
        setTimeout(() => this.children[i].hideLove(), 7e3);
      }
      for (let i = 0; i < 4; i++) {
        setTimeout(() => this.addAnimal({}), i * 1e3 + 7e3);
      }
      return true;
    }
    addAnimal({ isBaby = false }) {
      super.addAnimal(new Fish({
        parent: this,
        isBaby
      }));
    }
    update(gameStarted2, updateCount2) {
      super.update(gameStarted2, updateCount2);
    }
  };

  // src/weighted-random.js
  var weightedRandom = (weights) => {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const randomValue = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (randomValue < cumulativeWeight) {
        return i;
      }
    }
    return void 0;
  };

  // src/spawning.js
  var farmTypes = [colors.ox, colors.goat];
  var spawningLoopLength = 3e3;
  var getRandomNewType = () => {
    if (farms.length < farmTypes.length) {
      return farmTypes[farms.length];
    }
    const goodRatioTypes = farmTypes.filter((t) => {
      const yurtsOfThisType = yurts.filter((y) => y.type === t);
      const farmsOfThisType = farms.filter((f) => f.type === t);
      return yurtsOfThisType.length > farmsOfThisType.length;
    });
    return goodRatioTypes.at(Math.random() * goodRatioTypes.length);
  };
  var getRandomExistingType = () => {
    if (farms.length < farmTypes.length) {
      return farmTypes[farms.length - 1];
    }
    const yurtTypeCounts = {};
    yurts.filter((y) => y.type !== colors.fish).forEach((yurt) => {
      yurtTypeCounts[yurt.type] = yurtTypeCounts[yurt.type] ? yurtTypeCounts[yurt.type] + 1 : 1;
    });
    const farmTypeCounts = {};
    farms.filter((y) => y.type !== colors.fish).forEach((farm) => {
      farmTypeCounts[farm.type] = farmTypeCounts[farm.type] ? farmTypeCounts[farm.type] + 1 : 1;
    });
    const weights = [];
    Object.keys(farmTypeCounts).forEach((type) => {
      weights.push(farmTypeCounts[type] / yurtTypeCounts[type]);
    });
    const newType = Object.keys(farmTypeCounts)[weightedRandom(weights)];
    return newType;
  };
  var getRandomPosition = ({
    width = 1,
    height = 1,
    anchor = {
      x: gridWidth / 2,
      y: gridHeight / 2,
      width: 0,
      height: 0
    },
    minDistance = 0,
    maxDistance = 99,
    maxNumAttempts = 9,
    // TODO: Clever ways to not hit this. >8 makes game go sloww
    avoidTrees = true,
    extra = { x: 0, y: 0 }
    // relative to x/y
  }) => {
    let numAttempts = 0;
    while (numAttempts < maxNumAttempts) {
      numAttempts++;
      const minX = Math.max(
        boardOffsetX,
        anchor.x - maxDistance
      );
      const maxX = Math.min(
        boardOffsetX + boardWidth - width + 1,
        anchor.x + anchor.width + maxDistance - width + 1
      );
      const minY = Math.max(
        boardOffsetY,
        anchor.y - maxDistance
      );
      const maxY = Math.min(
        boardOffsetY + boardHeight - height + 1,
        anchor.y + anchor.height + maxDistance - height + 1
      );
      const x = Math.floor(minX + Math.random() * (maxX - minX));
      const y = Math.floor(minY + Math.random() * (maxY - minY));
      if (x < anchor.x + anchor.width + minDistance - 1 && x > anchor.x - minDistance - width + 1 && y < anchor.y + anchor.height + minDistance - 1 && y > anchor.y - minDistance - height + 1) continue;
      if (x + extra.x < boardOffsetX || x + extra.x > boardOffsetX + boardWidth - 1 || y + extra.y < boardOffsetY || y + extra.y > boardOffsetY + boardHeight - 1) {
        continue;
      }
      const pondObstruction = ponds.some((pond) => pond.avoidancePoints.some((pondCell) => {
        for (let w = 0; w < width; w++) {
          for (let h = 0; h < height; h++) {
            if (x + w === pondCell.x && y + h === pondCell.y) return true;
          }
        }
        if (x + extra.x === pondCell.x && y + extra.y === pondCell.y) {
          return true;
        }
        return false;
      }));
      if (pondObstruction) continue;
      const farmObstruction = farms.some((farm) => farm.points.some((farmCell) => {
        for (let w = 0; w < width; w++) {
          for (let h = 0; h < height; h++) {
            if (x + w === farmCell.x && y + h === farmCell.y) return true;
          }
        }
        return false;
      }));
      if (farmObstruction) continue;
      const pointOverlapsWithExtra = (point) => point.x === x + extra.x && point.y === y + extra.y;
      const farmExtraObstruction = farms.some((farm) => farm.points.some(pointOverlapsWithExtra));
      if (farmExtraObstruction) continue;
      const pathObstruction = paths.some((path) => {
        for (let w = 0; w < width; w++) {
          for (let h = 0; h < height; h++) {
            if (x + w === path.points[0].x && y + h === path.points[0].y || x + w === path.points[1].x && y + h === path.points[1].y) {
              return true;
            }
          }
        }
        return false;
      });
      if (pathObstruction) continue;
      const yurtObstruction = yurts.some((yurt) => {
        for (let w = 0; w < width; w++) {
          for (let h = 0; h < height; h++) {
            if (x + w === yurt.x && y + h === yurt.y) {
              return true;
            }
          }
        }
        if (x + extra.x === yurt.x && y + extra.y === yurt.y) {
          return true;
        }
        return void 0;
      });
      if (yurtObstruction) continue;
      if (avoidTrees) {
        const treeObstruction = trees.some((tree) => {
          for (let w = 0; w < width; w++) {
            for (let h = 0; h < height; h++) {
              if (x + w === tree.x && y + h === tree.y) {
                return true;
              }
            }
          }
          if (x + extra.x === tree.x && y + extra.y === tree.y) {
            return true;
          }
          return void 0;
        });
        if (treeObstruction) continue;
      }
      return { x, y };
    }
    return void 0;
  };
  var getRandomFarmProps = () => {
    const portrait = Math.random() > 0.5;
    const randWidthHeight = portrait ? { w: 2, h: 3 } : { w: 3, h: 2 };
    const farmProps = {
      width: randWidthHeight.w,
      height: randWidthHeight.h
    };
    if (!farms.length) {
      const randPathPosX1 = Math.floor(Math.random() * randWidthHeight.w);
      const randPathPosY1 = Math.floor(Math.random() * randWidthHeight.h);
      const randPathPosX2 = portrait ? randPathPosX1 * 3 - 1 : randPathPosX1;
      const randPathPosY2 = portrait ? randPathPosY1 : randPathPosY1 * 3 - 1;
      farmProps.relativePathPoints = [
        { x: randPathPosX1, y: randPathPosY1 },
        { x: randPathPosX2, y: randPathPosY2 }
      ];
    }
    return farmProps;
  };
  var getRandomYurtProps = () => {
    const facingInt = Math.random();
    let facing;
    if (facingInt < 0.25) {
      facing = { x: 0, y: -1 };
    } else if (facingInt < 0.5) {
      facing = { x: 1, y: 0 };
    } else if (facingInt < 0.75) {
      facing = { x: 0, y: 1 };
    } else {
      facing = { x: -1, y: 0 };
    }
    return {
      facing
    };
  };
  var updateRandomness1 = 0;
  var updateRandomness2 = 0;
  var updateRandomness3 = 0;
  var updateRandomness4 = 0;
  var spawnInfo = {
    yurtFailed: false
  };
  var spawnNewObjects = (updateCount2, delay) => {
    let upgradedThisLoop = false;
    if (updateCount2 % spawningLoopLength === 0) {
      updateRandomness1 = Math.floor(Math.random() * 200);
      updateRandomness2 = Math.floor(Math.random() * 200);
      updateRandomness3 = Math.floor(Math.random() * 200);
      updateRandomness4 = Math.floor(Math.random() * 200);
    }
    if (updateCount2 === 0) {
      if (Math.random() > 0.5) {
        const width = 6;
        const height = 4;
        const randomPosition = getRandomPosition({
          width,
          height,
          minDistance: 5,
          maxNumAttempts: 32
          // This could take a while, but it's required
        });
        if (randomPosition) {
          spawnPond({
            width,
            height,
            x: randomPosition.x,
            y: randomPosition.y
          });
        }
      } else {
        const randomPosition1 = getRandomPosition({
          width: 4,
          height: 4,
          minDistance: 5,
          maxNumAttempts: 16
        });
        if (randomPosition1) {
          spawnPond({
            width: 4,
            height: 4,
            x: randomPosition1.x,
            y: randomPosition1.y
          });
        }
        const randomPosition2 = getRandomPosition({
          width: 3,
          height: 2,
          minDistance: 5,
          maxNumAttempts: 16
        });
        if (randomPosition2) {
          spawnPond({
            width: 3,
            height: 2,
            x: randomPosition2.x,
            y: randomPosition2.y
          });
        }
        const randomPosition3 = getRandomPosition({
          width: 3,
          height: 2,
          minDistance: 5,
          maxNumAttempts: 16
        });
        if (randomPosition3) {
          spawnPond({
            width: 3,
            height: 2,
            x: randomPosition3.x,
            y: randomPosition3.y
          });
        }
      }
      for (let i = 0; i < 9; i++) {
        const randomPosition = getRandomPosition({});
        new Tree({
          x: randomPosition.x,
          y: randomPosition.y
        });
      }
    }
    if (updateCount2 === 0 || updateCount2 > 1e3 && updateCount2 % spawningLoopLength === 0 + (farms.length ? updateRandomness1 : 0)) {
      if (updateCount2 > 1e4 && !fishFarms.length) {
        const bigPond = ponds.find((pond) => pond.width >= 4 && pond.height >= 4);
        const pathPosX1 = bigPond.x < gridWidth / 2 ? 1 : 0;
        const pathPosX2 = bigPond.x < gridWidth / 2 ? 2 : -1;
        const pathPosX3 = bigPond.x < gridWidth / 2 ? 3 : -2;
        const pathPosY1 = bigPond.y < gridHeight / 2 ? 1 : 0;
        const x = bigPond.x + bigPond.width / 2 - 1;
        const y = bigPond.y + bigPond.height / 2 - 1;
        new FishFarm({
          x,
          y,
          relativePathPoints: [
            {
              x: pathPosX1,
              y: pathPosY1,
              fixed: true,
              stone: true
            },
            {
              x: bigPond.width > 4 ? pathPosX3 : pathPosX2,
              y: pathPosY1,
              fixed: true,
              stone: true
            }
          ]
        });
      } else {
        const { width, height, relativePathPoints } = getRandomFarmProps();
        const type = getRandomNewType();
        const randomPosition = getRandomPosition({
          width,
          height,
          anchor: farms.length > 1 ? yurts.filter((y) => y.type === type).at(Math.random() * yurts.length) : farms[farms.length - 1],
          // if undefined randomPosition will use default
          maxDistance: farms.length + 2,
          minDistance: farms.length ? 2 : 0,
          // We _need_ this to work on 1st loop otherwise the menu breaks.
          // Setting to 32 is sometimes slow, but it's pretty reliable, and small
          maxNumAttempts: 32,
          extra: relativePathPoints ? { x: relativePathPoints[1].x, y: relativePathPoints[1].y } : { x: 0, y: 0 },
          // i.e none
          avoidTrees: false
        });
        if (!randomPosition) {
          const shuffledFarms = shuffle(farms);
          for (let i = 0; i < shuffledFarms.length && !upgradedThisLoop; i++) {
            if (shuffledFarms[i].upgrade()) {
              upgradedThisLoop = true;
            }
          }
          return;
        }
        let newFarm;
        if (type === colors.ox) {
          newFarm = new OxFarm({
            width,
            height,
            x: randomPosition.x,
            y: randomPosition.y,
            relativePathPoints,
            delay
          });
        }
        if (type === colors.goat) {
          newFarm = new GoatFarm({
            width,
            height,
            x: randomPosition.x,
            y: randomPosition.y,
            relativePathPoints,
            delay
            // TODO: See if having this in every new farm call saves bytes
          });
        }
        if (newFarm) {
          trees.filter((t) => newFarm.points.some((p) => p.x === t.x && p.y === t.y)).forEach((tree) => tree.remove());
          return;
        }
      }
    }
    if (updateCount2 % spawningLoopLength === 500 + (farms.length > 1 ? updateRandomness2 : 0)) {
      const { facing } = getRandomYurtProps();
      const farm = farms.filter((f) => f.type === colors.fish).length && yurts.filter((y) => y.type === colors.fish).length < 2 ? farms.find((f) => f.type === colors.fish) : farms.length > 2 ? farms.at(Math.random() * farms.length) : farms[farms.length - 1];
      const randomPosition = getRandomPosition({
        anchor: {
          x: farm.x,
          y: farm.y,
          width: farm.width,
          height: farm.height
        },
        minDistance: 3,
        maxDistance: 2 + farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type: farm.type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 600 + updateRandomness2 && spawnInfo.yurtFailed) {
      const { facing } = getRandomYurtProps();
      const farm = farms.filter((f) => f.type === colors.fish).length && yurts.filter((y) => y.type === colors.fish).length < 2 ? farms.find((f) => f.type === colors.fish) : farms.length > 2 ? farms.at(Math.random() * farms.length) : farms[farms.length - 1];
      const randomPosition = getRandomPosition({
        anchor: {
          x: farm.x,
          y: farm.y,
          width: farm.width,
          height: farm.height
        },
        minDistance: 3,
        maxDistance: 2 + farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type: farm.type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 700 + updateRandomness2 && spawnInfo.yurtFailed) {
      const { facing } = getRandomYurtProps();
      const farm = farms.filter((f) => f.type === colors.fish).length && yurts.filter((y) => y.type === colors.fish).length < 2 ? farms.find((f) => f.type === colors.fish) : farms.length > 2 ? farms.at(Math.random() * farms.length) : farms[farms.length - 1];
      const randomPosition = getRandomPosition({
        anchor: {
          x: farm.x,
          y: farm.y,
          width: farm.width,
          height: farm.height
        },
        minDistance: 3,
        maxDistance: 2 + farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type: farm.type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 1500 + updateRandomness3) {
      const { facing } = getRandomYurtProps();
      const type = getRandomExistingType();
      const sameTypeYurts = yurts.filter((y) => y.type === type);
      const friendYurt = sameTypeYurts.at(Math.random() * sameTypeYurts.length);
      const randomPosition = getRandomPosition({
        anchor: {
          x: friendYurt.x,
          y: friendYurt.y,
          width: 1,
          height: 1
        },
        minDistance: 1,
        maxDistance: farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 1600 + updateRandomness3 && spawnInfo.yurtFailed) {
      const { facing } = getRandomYurtProps();
      const type = getRandomExistingType();
      const sameTypeYurts = yurts.filter((y) => y.type === type);
      const friendYurt = sameTypeYurts.at(Math.random() * sameTypeYurts.length);
      const randomPosition = getRandomPosition({
        anchor: {
          x: friendYurt.x,
          y: friendYurt.y,
          width: 1,
          height: 1
        },
        minDistance: 1,
        maxDistance: farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 1700 + updateRandomness3 && spawnInfo.yurtFailed) {
      const { facing } = getRandomYurtProps();
      const type = getRandomExistingType();
      const sameTypeYurts = yurts.filter((y) => y.type === type);
      const friendYurt = sameTypeYurts.at(Math.random() * sameTypeYurts.length);
      const randomPosition = getRandomPosition({
        anchor: {
          x: friendYurt.x,
          y: friendYurt.y,
          width: 1,
          height: 1
        },
        minDistance: 1,
        maxDistance: farms.length,
        extra: facing
      });
      if (randomPosition) {
        new Yurt({
          x: randomPosition.x,
          y: randomPosition.y,
          type,
          facing
        });
        spawnInfo.yurtFailed = false;
      } else {
        spawnInfo.yurtFailed = true;
      }
      return;
    }
    if (updateCount2 % spawningLoopLength === 2500 + updateRandomness4 && updateCount2 > 2e4) {
      const { width, height, relativePathPoints } = getRandomFarmProps();
      const type = getRandomNewType();
      const randomPosition = getRandomPosition({
        width,
        height,
        anchor: farms.length > 1 ? yurts.filter((y) => y.type === type).at(Math.random() * yurts.length) : farms[farms.length - 1],
        // if undefined randomPosition will use default
        maxDistance: farms.length + 2,
        minDistance: farms.length ? 2 : 0,
        extra: relativePathPoints ? { x: relativePathPoints[1].x, y: relativePathPoints[1].y } : { x: 0, y: 0 },
        // i.e none
        avoidTrees: false
      });
      if (!randomPosition) {
        const shuffledFarms = shuffle(farms);
        for (let i = 0; i < shuffledFarms.length && !upgradedThisLoop; i++) {
          if (shuffledFarms[i].upgrade()) {
            upgradedThisLoop = true;
          }
        }
        return;
      }
      let newFarm;
      if (type === colors.ox) {
        newFarm = new OxFarm({
          width,
          height,
          x: randomPosition.x,
          y: randomPosition.y,
          relativePathPoints,
          delay
        });
      }
      if (type === colors.goat) {
        newFarm = new GoatFarm({
          width,
          height,
          x: randomPosition.x,
          y: randomPosition.y,
          relativePathPoints,
          delay
          // TODO: See if having this in every new farm call saves bytes
        });
      }
      if (newFarm) {
        trees.filter((t) => newFarm.points.some((p) => p.x === t.x && p.y === t.y)).forEach((tree) => tree.remove());
      }
    }
  };

  // src/menu-background.js
  var menuBackground = createElement();
  menuBackground.style.cssText = `
  backdrop-filter: blur(8px);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: #fffb;
`;
  var initMenuBackground = () => {
    document.body.append(menuBackground);
    menuBackground.style.opacity = 0;
  };

  // src/gameover.js
  var gameoverWrapper = createElement();
  var gameoverHeader = createElement();
  var gameoverText1 = createElement();
  var gameoverText2 = createElement();
  var gameoverText3 = createElement();
  var gameoverButtons = createElement();
  var restartButtonWrapper = createElement();
  var restartButton = createElement("button");
  var menuButtonWrapper = createElement();
  var menuButton = createElement("button");
  var oxEmojiWrapper = createElement();
  var oxEmoji = emojiOx();
  var goatEmojiWrapper = createElement();
  var goatEmoji = emojiGoat();
  var fishEmojiWrapper = createElement();
  var fishEmoji = emojiFish();
  var scoreWrapper = createElement();
  var toggleGameoverlayButton = createElement("button");
  var initGameover = (startNewGame2, gameoverToMenu2, toggleGameoverlay2) => {
    gameoverWrapper.style.cssText = `
    position: absolute;
    inset: 0;
    padding: 10vmin;
    display: flex;
    flex-direction: column;
  `;
    gameoverWrapper.style.pointerEvents = "none";
    gameoverWrapper.style.opacity = 0;
    gameoverHeader.style.cssText = `font-size: 72px; opacity: 0`;
    gameoverHeader.innerText = "Game Over";
    gameoverText1.style.cssText = `margin-top: 48px; font-size: 24px; opacity:0`;
    gameoverText1.innerText = "Too few people could tend to this farm in time.";
    gameoverText2.style.cssText = `margin-top: 16px; font-size: 24px; opacity: 0`;
    gameoverText3.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 24px;
    font-size: 24px;
  `;
    gameoverText3.style.opacity = 0;
    if (document.body.scrollHeight < 500) {
      gameoverText3.style.position = "absolute";
      gameoverText3.style.bottom = "10vmin";
      gameoverText3.style.right = "10vmin";
    } else {
      gameoverText3.style.position = "";
      gameoverText3.style.bottom = "";
      gameoverText3.style.right = "";
    }
    addEventListener("resize", () => {
      if (document.body.scrollHeight < 500) {
        gameoverText3.style.position = "absolute";
        gameoverText3.style.bottom = "10vmin";
        gameoverText3.style.right = "10vmin";
      } else {
        gameoverText3.style.position = "";
        gameoverText3.style.bottom = "";
        gameoverText3.style.right = "";
      }
    });
    oxEmojiWrapper.style.cssText = `display:inline-flex;padding:6px 12px;line-height:24px;color:#fff;border-radius:64px;background:${colors.ui}`;
    goatEmojiWrapper.style.cssText = `display:inline-flex;padding:6px 12px;line-height:24px;color:#fff;border-radius:64px;background:${colors.ui}`;
    fishEmojiWrapper.style.cssText = `display:inline-flex;padding:6px 12px;line-height:24px;color:#fff;border-radius:64px;background:${colors.ui}`;
    scoreWrapper.style.cssText = `display:inline-flex;padding:6px 12px;line-height:24px;color:#fff;border-radius:64px;background:${colors.ui}`;
    oxEmoji.style.width = "24px";
    oxEmoji.style.height = "24px";
    goatEmoji.style.width = "24px";
    goatEmoji.style.height = "24px";
    fishEmoji.style.width = "24px";
    fishEmoji.style.height = "24px";
    menuButtonWrapper.style.opacity = 0;
    restartButtonWrapper.style.opacity = 0;
    menuButtonWrapper.append(menuButton);
    restartButtonWrapper.append(restartButton);
    restartButton.innerText = "Restart";
    menuButton.innerText = "Menu";
    restartButton.addEventListener("click", startNewGame2);
    menuButton.addEventListener("click", gameoverToMenu2);
    gameoverButtons.append(restartButtonWrapper, menuButtonWrapper);
    gameoverButtons.style.cssText = `gap: 16px; margin-top: 48px;`;
    if (document.body.scrollHeight < 500) {
      gameoverButtons.style.display = "flex";
      gameoverButtons.style.position = "absolute";
      gameoverButtons.style.bottom = "10vmin";
      gameoverButtons.style.left = "10vmin";
    } else {
      gameoverButtons.style.display = "grid";
      gameoverButtons.style.position = "";
      gameoverButtons.style.bottom = "";
      gameoverButtons.style.left = "";
    }
    addEventListener("resize", () => {
      if (document.body.scrollHeight < 500) {
        gameoverButtons.style.display = "flex";
        gameoverButtons.style.position = "absolute";
        gameoverButtons.style.bottom = "10vmin";
        gameoverButtons.style.left = "10vmin";
      } else {
        gameoverButtons.style.display = "grid";
        gameoverButtons.style.position = "";
        gameoverButtons.style.bottom = "";
        gameoverButtons.style.left = "";
      }
    });
    toggleGameoverlayButton.style.cssText = `position: absolute; top: 10vmin; right: 10vmin`;
    toggleGameoverlayButton.style.pointerEvents = "none";
    toggleGameoverlayButton.style.opacity = 0;
    toggleGameoverlayButton.innerText = "Overlay On/Off";
    toggleGameoverlayButton.addEventListener("click", toggleGameoverlay2);
    gameoverWrapper.append(
      gameoverHeader,
      gameoverText1,
      gameoverText2,
      gameoverText3,
      gameoverButtons
    );
    document.body.append(gameoverWrapper, toggleGameoverlayButton);
  };
  var showGameover = () => {
    const score = yurts.length * 2 + animals.length;
    uiContainer.style.zIndex = "";
    if (score > localStorage.getItem("Tiny Yurts")) {
      localStorage.setItem("Tiny Yurts", score);
    }
    menuBackground.style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%)`;
    menuBackground.style.transition = `opacity 2s 1s`;
    gameoverHeader.style.transition = `opacity .5s 2s`;
    gameoverText1.style.transition = `opacity .5s 2s`;
    gameoverText2.style.transition = `opacity .5s 2s`;
    gameoverText3.style.transition = `opacity .5s 2s`;
    restartButtonWrapper.style.transition = `opacity .5s 2.5s`;
    menuButtonWrapper.style.transition = `opacity .5s 3s`;
    toggleGameoverlayButton.style.transition = `all .2s, opacity .5s 3.5s`;
    oxEmojiWrapper.innerHTML = "";
    oxEmojiWrapper.append(oxEmoji, `\xD7${oxen.length}`);
    goatEmojiWrapper.innerHTML = "";
    goatEmojiWrapper.append(goatEmoji, `\xD7${goats.length}`);
    fishEmojiWrapper.innerHTML = "";
    fishEmojiWrapper.append(fishEmoji, `\xD7${fishes.length}`);
    scoreWrapper.innerHTML = `Score:${score}`;
    const peopleCount = createElement("u");
    peopleCount.innerText = `${yurts.length * 2} settlers`;
    const animalsCount = createElement("u");
    animalsCount.innerText = `${animals.length} animals`;
    gameoverText2.innerHTML = "";
    gameoverText2.append(peopleCount, " and ", animalsCount, " lived in your camp.");
    gameoverText3.innerHTML = "";
    gameoverText3.append(
      oxEmojiWrapper,
      " ",
      goatEmojiWrapper,
      " ",
      fishEmojiWrapper,
      " ",
      scoreWrapper
    );
    soundToggleButton.style.transition = `all .2s`;
    gridRedToggleButton.style.transition = `all .2s`;
    gridToggleButton.style.transition = `all .2s`;
    soundToggleButton.style.opacity = 0;
    gridRedToggleButton.style.opacity = 0;
    gridToggleButton.style.opacity = 0;
    scoreCounters.style.opacity = 0;
    setTimeout(() => {
      toggleGameoverlayButton.style.pointerEvents = "";
      gameoverWrapper.style.pointerEvents = "";
      gameoverWrapper.style.opacity = 1;
      menuBackground.style.opacity = 1;
      gameoverHeader.style.opacity = 1;
      gameoverText1.style.opacity = 1;
      gameoverText2.style.opacity = 1;
      gameoverText3.style.opacity = 1;
      restartButtonWrapper.style.opacity = 1;
      menuButtonWrapper.style.opacity = 1;
      toggleGameoverlayButton.style.opacity = 1;
    });
  };
  var hideGameover = () => {
    gameoverWrapper.style.transition = `opacity 1s 2s`;
    menuBackground.style.transition = `opacity 1s 1s`;
    gameoverHeader.style.transition = `opacity .3s .6s`;
    gameoverText1.style.transition = `opacity .3s .5s`;
    gameoverText2.style.transition = `opacity .3s .4s`;
    gameoverText3.style.transition = `opacity .3s .3s`;
    restartButtonWrapper.style.transition = `opacity .3s .2s`;
    menuButtonWrapper.style.transition = `opacity .3s .1s`;
    gameoverWrapper.style.pointerEvents = "none";
    gameoverWrapper.style.opacity = 0;
    menuBackground.style.opacity = 0;
    gameoverHeader.style.opacity = 0;
    gameoverText1.style.opacity = 0;
    gameoverText2.style.opacity = 0;
    gameoverText3.style.opacity = 0;
    restartButtonWrapper.style.opacity = 0;
    menuButtonWrapper.style.opacity = 0;
  };

  // src/menu.js
  var menuWrapper = createElement();
  var menuHeader = createElement();
  var menuText1 = createElement();
  var menuButtons = createElement();
  var startButtonWrapper = createElement();
  var startButton = createElement("button");
  var fullscreenButtonWrapper = createElement();
  var fullscreenButton = createElement("button");
  var initMenu = (startGame2) => {
    menuWrapper.style.cssText = `
    position: absolute;
    inset: 0;
    padding: 10vmin;
    display: flex;
    flex-direction: column;
  `;
    menuWrapper.style.pointerEvents = "none";
    menuBackground.style.clipPath = "polygon(0 0, calc(20dvw + 400px) 0, calc(20dvw + 350px) 100%, 0 100%)";
    menuHeader.style.cssText = `font-size: 72px; opacity: 0;`;
    menuHeader.innerText = "Tiny Yurts";
    menuText1.style.cssText = `margin: auto 4px 0; opacity:0;`;
    if (localStorage.getItem("Tiny Yurts")) {
      menuText1.innerText = `Highscore: ${localStorage.getItem("Tiny Yurts")}`;
    }
    startButton.innerText = "Start";
    startButton.addEventListener("click", () => {
      initAudio();
      startGame2();
    });
    startButtonWrapper.style.opacity = 0;
    fullscreenButton.innerText = "Fullscreen";
    fullscreenButton.addEventListener("click", () => {
      initAudio();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
        screen.orientation.lock("landscape").catch(() => {
        });
      }
    });
    fullscreenButtonWrapper.style.opacity = 0;
    menuButtons.style.cssText = `display: grid; gap: 16px; margin-top: 48px;`;
    startButtonWrapper.append(startButton);
    fullscreenButtonWrapper.append(fullscreenButton);
    menuButtons.append(fullscreenButtonWrapper, startButtonWrapper);
    menuWrapper.append(menuHeader, menuButtons, menuText1);
    document.body.append(menuWrapper);
  };
  var showMenu = (focus, firstTime) => {
    menuWrapper.style.pointerEvents = "";
    menuBackground.style.clipPath = `polygon(0 0, calc(20dvw + 400px) 0, calc(20dvw + 350px) 100%, 0 100%)`;
    menuBackground.style.transition = `clip-path 1s, opacity 2s`;
    menuHeader.style.transition = `opacity .5s 1s`;
    fullscreenButtonWrapper.style.transition = `opacity .5s 1.2s`;
    startButtonWrapper.style.transition = `opacity .5s 1.4s`;
    menuText1.style.transition = `opacity .5s 1.6s`;
    if (firstTime) {
      menuBackground.style.transition = `opacity 0s`;
      menuHeader.style.transition = `opacity .5s .4s`;
      fullscreenButtonWrapper.style.transition = `opacity .5s .6s`;
      startButtonWrapper.style.transition = `opacity .5s .8s`;
      menuText1.style.transition = `opacity .5s 1s`;
    }
    menuText1.innerHTML = localStorage.getItem("Tiny Yurts") ? `Highscore: ${localStorage.getItem("Tiny Yurts")}` : "Tip: Drag from a yurt onto a farm. The red grid erases a path.";
    const farmPxPosition = svgPxToDisplayPx(
      focus.x - gridWidth / 2 - boardOffsetX + focus.width / 2,
      focus.y - gridHeight / 2 - boardOffsetY + focus.height / 2
    );
    const xOffset = innerWidth / 4;
    svgElement.style.transition = "";
    svgElement.style.transform = `translate(${xOffset}px, 0) rotate(-17deg) scale(2) translate(${-farmPxPosition.x}px, ${-farmPxPosition.y}px)`;
    uiContainer.style.zIndex = 1;
    menuBackground.style.opacity = 1;
    menuHeader.style.opacity = 1;
    menuText1.style.opacity = 1;
    startButtonWrapper.style.opacity = 1;
    fullscreenButtonWrapper.style.opacity = 1;
  };
  var hideMenu = () => {
    menuWrapper.style.pointerEvents = "none";
    uiContainer.style.zIndex = "";
    menuBackground.style.transition = `opacity 1s .6s`;
    menuHeader.style.transition = `opacity .3s .4s`;
    fullscreenButtonWrapper.style.transition = `opacity .3s .3s`;
    startButtonWrapper.style.transition = `opacity .3s .2s`;
    menuText1.style.transition = `opacity.3s.1s`;
    menuBackground.style.opacity = 0;
    fullscreenButtonWrapper.style.opacity = 0;
    startButtonWrapper.style.opacity = 0;
    fullscreenButtonWrapper.style.transition = 0;
    menuText1.style.opacity = 0;
    menuHeader.style.opacity = 0;
    soundToggleTooltip.style.opacity = 0;
    gridRedToggleTooltip.style.opacity = 0;
    gridToggleTooltip.style.opacity = 0;
    soundToggleTooltip.style.width = 0;
    gridRedToggleTooltip.style.width = 0;
    gridToggleTooltip.style.width = 0;
  };

  // src/main.js
  var updateCount = 0;
  var renderCount = 0;
  var totalUpdateCount = 0;
  var gameOverlayHidden;
  var lostFarmPosition;
  var gameStarted = false;
  var loop = GameLoop({
    update() {
      if (gameStarted) {
        spawnNewObjects(totalUpdateCount, gameStarted);
        if (totalUpdateCount === 120) {
          scoreCounters.style.opacity = 1;
        }
        if (totalUpdateCount === 150) {
          pathTilesIndicator.style.opacity = 1;
        }
        if (totalUpdateCount === 180) {
          clock.style.opacity = 1;
        }
        if (totalUpdateCount === 210) {
          pauseButton.style.opacity = 1;
        }
        if (totalUpdateCount % (720 * 12) === 0 && inventory.paths < 99) {
          pathTilesIndicator.style.scale = 1.1;
          pathTilesIndicatorCount.innerText = "+9";
          setTimeout(() => pathTilesIndicatorCount.innerText = inventory.paths, 1300);
          for (let i = 0; i < 9; i++) {
            setTimeout(() => {
              if (inventory.paths < 99) {
                inventory.paths++;
                pathTilesIndicatorCount.innerText = inventory.paths;
              }
            }, 1300 + 100 * i);
          }
          setTimeout(() => {
            pathTilesIndicator.style.scale = 1;
          }, 300);
        }
        clockHand.style.transform = `rotate(${totalUpdateCount / 2}deg)`;
        if (Math.floor(totalUpdateCount / 720 % 12) === 0) {
          clockMonth.innerText = "Jan";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 1) {
          clockMonth.innerText = "Feb";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 2) {
          clockMonth.innerText = "Mar";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 3) {
          clockMonth.innerText = "Apr";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 4) {
          clockMonth.innerText = "May";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 5) {
          clockMonth.innerText = "Jun";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 6) {
          clockMonth.innerText = "Jul";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 7) {
          clockMonth.innerText = "Aug";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 8) {
          clockMonth.innerText = "Sep";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 9) {
          clockMonth.innerText = "Oct";
        } else if (Math.floor(totalUpdateCount / 720 % 12) === 10) {
          clockMonth.innerText = "Nov";
        } else {
          clockMonth.innerText = "Dec";
        }
      }
      updateCount++;
      totalUpdateCount++;
      if (updateCount % 4 === 0) {
        updateGridData();
      } else if (updateCount % 4 === 1) {
        oxFarms.forEach((farm) => farm.update(gameStarted, totalUpdateCount));
      } else if (updateCount % 4 === 2) {
        goatFarms.forEach((farm) => farm.update(gameStarted, totalUpdateCount));
      } else {
        fishFarms.forEach((farm) => farm.update(gameStarted, totalUpdateCount));
      }
      if (updateCount >= 60) updateCount = 0;
      farms.forEach((f) => {
        if (!f.isAlive) {
          gameStarted = false;
          loop.stop();
          lostFarmPosition = svgPxToDisplayPx(
            f.x - gridWidth / 2 - boardOffsetX + f.width / 2,
            f.y - gridHeight / 2 - boardOffsetY + f.height / 2
          );
          svgElement.style.transition = `transform 2s ease-out .5s`;
          svgElement.style.transform = `rotate(-17deg) scale(2) translate(${-lostFarmPosition.x}px, ${-lostFarmPosition.y}px)`;
          oxCounterWrapper.style.opacity = 0;
          goatCounterWrapper.style.opacity = 0;
          fishCounterWrapper.style.opacity = 0;
          clock.style.opacity = 0;
          pathTilesIndicator.style.opacity = 0;
          pauseButton.style.opacity = 0;
          gridRedState.on = false;
          gridRedState.buttonShown = false;
          gridRedHide();
          updateCount = 0;
          totalUpdateCount = 0;
          renderCount = 0;
          showGameover(startNewGame);
        }
      });
      people.forEach((p) => p.update());
    },
    render() {
      renderCount++;
      if (renderCount % 4 === 1) {
        oxFarms.forEach((farm) => farm.render());
      } else if (renderCount % 4 === 2) {
        goatFarms.forEach((farm) => farm.render());
      } else {
        fishFarms.forEach((farm) => farm.render());
      }
      if (renderCount >= 60) renderCount = 0;
      people.forEach((p) => p.render());
    }
  });
  var startNewGame = () => {
    if (!gameStarted && loop.isStopped) {
      gameStarted = true;
      svgElement.style.transition = `transform 2s`;
      svgElement.style.transform = `rotate(0) scale(2) translate(0, ${svgPxToDisplayPx(0, gridHeight).y / -2}px)`;
      soundToggleButton.style.transition = `all .2s, width.5s 4s, opacity .5s 3s`;
      gridRedToggleButton.style.transition = `all .2s, width.5s 4s, opacity .5s 3s`;
      gridToggleButton.style.transition = `all .2s, width .5s 4s, opacity .5s 3s`;
      soundToggleTooltip.style.transition = `all .5s`;
      gridRedToggleTooltip.style.transition = `all .5s`;
      gridToggleTooltip.style.transition = `all .5s`;
      soundToggleButton.style.opacity = 1;
      gridRedToggleButton.style.opacity = 1;
      gridToggleButton.style.opacity = 1;
      oxCounterWrapper.style.width = 0;
      goatCounterWrapper.style.width = 0;
      fishCounterWrapper.style.width = 0;
      oxCounterWrapper.style.opacity = 0;
      goatCounterWrapper.style.opacity = 0;
      fishCounterWrapper.style.opacity = 0;
      oxCounter.innerText = 0;
      goatCounter.innerText = 0;
      fishCounter.innerText = 0;
      pauseButton.style.opacity = 0;
      toggleGameoverlayButton.style.opacity = 0;
      toggleGameoverlayButton.style.pointerEvents = "none";
      toggleGameoverlayButton.style.transition = `all .2s, opacity .5s`;
      setTimeout(() => {
        goatFarms.length = 0;
        oxFarms.length = 0;
        fishFarms.length = 0;
        people.length = 0;
        farms.length = 0;
        animals.length = 0;
        oxen.length = 0;
        goats.length = 0;
        fishes.length = 0;
        yurts.length = 0;
        paths.length = 0;
        ponds.length = 0;
        trees.length = 0;
        updateCount = 1;
        totalUpdateCount = 1;
        renderCount = 1;
        inventory.paths = 18;
        pathTilesIndicatorCount.innerText = inventory.paths;
        clearLayers();
        hideGameover();
        svgElement.style.transform = "";
        setTimeout(() => {
          spawnNewObjects(0);
          loop.start();
        }, 1e3);
      }, 1e3);
    }
  };
  var gameoverToMenu = () => {
    gameStarted = false;
    svgElement.style.transition = `transform 2s`;
    svgElement.style.transform = `rotate(0) scale(2) translate(0, ${svgPxToDisplayPx(0, gridHeight).y / -2}px)`;
    inventory.paths = 18;
    oxCounterWrapper.style.width = 0;
    goatCounterWrapper.style.width = 0;
    fishCounterWrapper.style.width = 0;
    oxCounterWrapper.style.opacity = 0;
    goatCounterWrapper.style.opacity = 0;
    fishCounterWrapper.style.opacity = 0;
    oxCounter.innerText = 0;
    goatCounter.innerText = 0;
    fishCounter.innerText = 0;
    toggleGameoverlayButton.style.opacity = 0;
    toggleGameoverlayButton.style.pointerEvents = "none";
    toggleGameoverlayButton.style.transition = `all .2s, opacity .5s`;
    soundToggleTooltip.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    gridRedToggleTooltip.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    gridToggleTooltip.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    soundToggleButton.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    gridRedToggleButton.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    gridToggleButton.style.transition = `all.2s,width.5s 4s,opacity.5s 4s`;
    soundToggleTooltip.style.width = "96px";
    gridRedToggleTooltip.style.width = "96px";
    gridToggleTooltip.style.width = "96px";
    soundToggleTooltip.style.opacity = 1;
    gridRedToggleTooltip.style.opacity = 1;
    gridToggleTooltip.style.opacity = 1;
    soundToggleButton.style.opacity = 1;
    gridRedToggleButton.style.opacity = 1;
    gridToggleButton.style.opacity = 1;
    setTimeout(() => {
      goatFarms.length = 0;
      oxFarms.length = 0;
      fishFarms.length = 0;
      people.length = 0;
      farms.length = 0;
      animals.length = 0;
      oxen.length = 0;
      goats.length = 0;
      fishes.length = 0;
      yurts.length = 0;
      paths.length = 0;
      ponds.length = 0;
      trees.length = 0;
      updateCount = 0;
      totalUpdateCount = 0;
      renderCount = 0;
      clearLayers();
      hideGameover();
      svgElement.style.transform = "";
      pathTilesIndicatorCount.innerText = inventory.paths;
      setTimeout(() => {
        spawnNewObjects(totalUpdateCount, gameStarted, 2e3);
        showMenu(farms[0]);
        loop.start();
      }, 750);
    }, 500);
  };
  var toggleGameoverlay = () => {
    if (gameOverlayHidden) {
      gameOverlayHidden = false;
      svgElement.style.transform = `rotate(-17deg) scale(2) translate(${-lostFarmPosition.x}px, ${-lostFarmPosition.y}px)`;
      showGameover();
    } else {
      gameOverlayHidden = true;
      svgElement.style.transform = "";
      hideGameover();
    }
  };
  initUi();
  initMenuBackground();
  initGameover(startNewGame, gameoverToMenu, toggleGameoverlay);
  initPointer();
  var startGame = () => {
    if (!gameStarted) {
      svgElement.style.transition = `transform 2s`;
      svgElement.style.transform = "";
      pathTilesIndicatorCount.innerText = inventory.paths;
      hideMenu();
      gameStarted = true;
      updateCount = 1;
      totalUpdateCount = 1;
      renderCount = 1;
      soundToggleTooltip.style.transition = `all.5s`;
      gridRedToggleTooltip.style.transition = `all.5s`;
      gridToggleTooltip.style.transition = `all.5s`;
      soundToggleButton.style.opacity = 1;
      gridRedToggleButton.style.opacity = 1;
      gridToggleButton.style.opacity = 1;
    }
  };
  initMenu(startGame);
  spawnNewObjects(totalUpdateCount, 2500);
  showMenu(farms[0], true);
  var togglePause = () => {
    if (gameStarted && totalUpdateCount > 210) {
      if (loop.isStopped) {
        loop.start();
        pauseSvgPath.setAttribute("d", "M6 6 6 10M10 6 10 8 10 10");
        pauseSvgPath.style.transform = "rotate(180deg)";
      } else {
        loop.stop();
        pauseSvgPath.setAttribute("d", "M7 6 7 10M7 6 10 8 7 10");
        pauseSvgPath.style.transform = "rotate(0)";
      }
    }
  };
  var toggleSound = () => {
    initAudio();
    if (soundSetings.on) {
      soundSetings.on = false;
      localStorage.setItem("Tiny Yurtss", false);
      soundToggleSvgPathX.setAttribute("d", "M11 7Q10 8 9 9M9 7Q10 8 11 9");
      soundToggleSvgPathX.style.stroke = colors.red;
      soundToggleTooltip.innerHTML = "Sound: <u>Off";
    } else {
      soundSetings.on = true;
      localStorage.setItem("Tiny Yurtss", true);
      soundToggleSvgPathX.setAttribute("d", "M10 6Q12 8 10 10M10 6Q12 8 10 10");
      soundToggleSvgPathX.style.stroke = colors.ui;
      soundToggleTooltip.innerHTML = "Sound: <u>On";
    }
    playSound(30, 1, 1, 1, 0.3, 1e3, 1e3);
  };
  if (soundSetings.on) {
    soundToggleSvgPathX.setAttribute("d", "M10 6Q12 8 10 10M10 6Q12 8 10 10");
    soundToggleSvgPathX.style.stroke = colors.ui;
    soundToggleTooltip.innerHTML = "Sound: <u>On";
  } else {
    soundToggleSvgPathX.setAttribute("d", "M11 7Q10 8 9 9M9 7Q10 8 11 9");
    soundToggleSvgPathX.style.stroke = colors.red;
    soundToggleTooltip.innerHTML = "Sound: <u>Off";
  }
  pauseButton.addEventListener("click", togglePause);
  gridRedToggleButton.addEventListener("click", gridRedLockToggle);
  gridToggleButton.addEventListener("click", gridLockToggle);
  soundToggleButton.addEventListener("click", toggleSound);
  soundToggleTooltip.addEventListener("click", () => soundToggleButton.click());
  gridRedToggleTooltip.addEventListener("click", () => gridRedToggleButton.click());
  gridToggleTooltip.addEventListener("click", () => gridToggleButton.click());
  document.addEventListener("keypress", (event) => {
    if (event.key === " ") {
      if (event.target !== pauseButton) {
        togglePause();
      }
      pauseButton.style.transform = "scale(.95)";
      setTimeout(() => pauseButton.style.transform = "", 150);
    }
  });
  setTimeout(() => {
    loop.start();
  }, 1e3);
  globalThis.TinyYurts = {
    inventory,
    Path,
    removePath,
    getBoardCell,
    isPastHalfwayInto,
    get paths() { return paths; },
    get yurts() { return yurts; },
    get farms() { return farms; },
    get gameStarted() { return gameStarted; },
    get gridPointerLayer() { return gridPointerLayer; },
    startGame,
    handlePointerdown,
    handlePointermove,
    handlePointerup
  };
})();
