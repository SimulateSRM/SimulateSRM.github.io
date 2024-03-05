// This file contains the FOVTransform class, which can be used to render multiple field-of-view images in parallel using Web Workers.
// Inputs:
//  - inputImgFiles: an array of URLs to the input images
//  - inputFormat: an object describing the format of the input images. It should have the following properties:
//    - type: 'polar' or 'cylindrical',
//    - maxTheta: maximum zenith angle available in the input images (in radians),
//  - destinationCanvas: an array of canvas DOM elements where the output images will be rendered
//  - params: needed for rendering the output images. It must have the following properties:
//    - fov: an object describing the field of view to be rendered, with the following properties:
//      - l: field of view to the left of the fixation point (in radians),
//      - r: field of view to the right of the fixation point (in radians),
//      - u: field of view above the fixation point (in radians),
//      - d: field of view below the fixation point (in radians),
//    - altitude: altitude of the fixation point (in radians). Zero is the horizon, PI/2 is the zenith, -PI/2 is the nadir,
//    - roll: rotation of the image around the fixation point (in radians),
//    - azimuth: azimuth of the fixation point (in radians),
//    - interpolation: '', 'linear', 'cubic', or 'lanczos',
//    - outputWidth: width of the output image (in pixels). If undefined, the width will be automatically calculated based on the input image size.
// };


class FOVTransform {
  #renderEnvs = [];
  #renderQueue = [];
  #inputFormat = {};
  #loaded = false;
  #loading = false;

  constructor() {
    this.onLoadCallback = undefined;
    this.onRenderCallback = undefined;
  }

  #setAllRenderEnvsAvailable() {
    for (let env of this.#renderEnvs) {
      env.available = true;
    }
  }
  
  #getRenderEnvironment(url, destinationCanvas) {
    // First, try to reuse an existing render environment that has already loaded this image (if any)
    for (let env of this.#renderEnvs) {
      if (env.url === url && env.available) {
        env.available = false;
        env.destinationCanvas = destinationCanvas;
        return env;
      }
    }
    // If not, try to reuse any other existing render environment
    for (let env of this.#renderEnvs) {
      if (env.available) {
        env.available = false;
        env.destinationCanvas = destinationCanvas;
        env.url = url;
        env.imgLoaded = false;
        return env;
      }
    }
    // If no render environment is available, create a new one
    const renderEnv = {
      canvas: document.createElement('canvas'),
      img: new Image(),
      worker: new Worker('render.js'),
      imgData: undefined,
      renderPromise: undefined,
      destinationCanvas: destinationCanvas,
      url: url,
      imgLoaded: false,
      available: false
    }
    this.#renderEnvs.push(renderEnv);
    return renderEnv;
  }

  #terminateAllEnvironments() {
    for (let env of this.#renderEnvs) {
      env.worker.terminate();
      env.canvas.remove();
    }
    this.#renderEnvs.length = 0;
  }

  #loadEnvironment(env) {
    if (env.imgLoaded && env.img.src === env.url)
      return Promise.resolve(env);

    env.img.src = env.url;
    return new Promise((resolve) => {
      env.img.addEventListener('load', () => {
        const ctx = env.canvas.getContext('2d', { willReadFrequently: true });
        const {width, height} = env.img;
        env.canvas.width = width;
        env.canvas.height = height;
        ctx.drawImage(env.img, 0, 0);
        env.imgData = ctx.getImageData(0, 0, width, height);
        env.imgLoaded = true;
        resolve(env);
      });
    });
  }

  #allRendersComplete() {
    const promises = [];
    for (let env of this.#renderEnvs) {
      if (!env.available)
        promises.push(env.renderPromise);
    }
    return Promise.all(promises);
  }

  #renderEnv(env, config) {
    env.renderPromise = new Promise((resolve) => {
      const setImage = ({data: imageData}) => {
        env.destinationCanvas.width = imageData.width;
        env.destinationCanvas.height = imageData.height;
        const ctx = env.destinationCanvas.getContext('2d', { willReadFrequently: true });
        ctx.putImageData(imageData, 0, 0);
        resolve();
      };

      env.worker.onmessage = setImage;
      env.worker.postMessage({config, data: env.imgData});
    });
  }

  // Public method: load images into memory and prepare the render environments
  async loadImages(inputImgFiles, inputFormat, destinationCanvas) {
    if (inputImgFiles.length !== destinationCanvas.length)
      throw new Error('Number of input images does not match number of destination canvases');
    
    // Wait for any ongoing renders to complete
    await this.#allRendersComplete();
    if (this.#loading)
      return;
    this.#loading = true;
    this.#loaded = false;
    this.#inputFormat = inputFormat;

    // Create (or reuse, if possible) render environments for each input image. Then load the images in memory
    const promises = [];
    this.#setAllRenderEnvsAvailable();
    for (let i=0; i<inputImgFiles.length; i++) {
      const renderEnv = this.#getRenderEnvironment(inputImgFiles[i], destinationCanvas[i]);
      promises.push(this.#loadEnvironment(renderEnv));
    }

    // Wait for all images to load
    await Promise.all(promises);
    this.#loading = false;
    this.#loaded = true;
    if (this.onLoadCallback) this.onLoadCallback(inputImgFiles);
  }

  // Public method: render the loaded images and draw the output on the destination canvases
  async render(params) {
    if (!this.#loaded)
      return;

    // In order to keep the app response, we use a render queue (if a render is in progress, the new render is queued and will be executed after the current one is finished)
    // Accept only one render in the queue (the last one). If a new render is requested, it will replace the current one in the queue (meaning it will be skipped)
    if (this.#renderQueue.length > 0) {
      this.#renderQueue[0] = params;
      return;
    }
    this.#renderQueue.push(params);
    await this.#allRendersComplete();
    const p = this.#renderQueue.pop();
    const config = {inputFormat: this.#inputFormat, ...p};

    for (let env of this.#renderEnvs) {
      this.#renderEnv(env, config);
    }
    await this.#allRendersComplete();
    if (this.onRenderCallback) this.onRenderCallback();
  }
}