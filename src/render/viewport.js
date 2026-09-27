// @ts-check
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * @typedef {object} View
 * A renderable screen (galaxy map, star system, battle replay...).
 * @property {THREE.Scene} scene
 * @property {THREE.Camera} camera
 * @property {(width: number, height: number) => void} resize
 * @property {(dtReal: number) => void} [update]  called every frame before rendering
 * @property {() => void} [dispose]
 */

/**
 * Owns the WebGL canvas and the label layer, and renders whichever view is active.
 * Views never create renderers themselves, so switching screens is cheap.
 * @param {HTMLElement} container
 */
export function createViewport(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.classList.add('label-layer');
  container.appendChild(labels.domElement);

  /** @type {View | null} */
  let view = null;
  /** @type {((dtReal: number) => void)[]} */
  const frameHooks = [];
  let last = performance.now();

  function size() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    view?.resize(w, h);
  }

  const observer = new ResizeObserver(size);
  observer.observe(container);

  /** @param {number} now */
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    for (const hook of frameHooks) hook(dt);
    if (view) {
      view.update?.(dt);
      renderer.render(view.scene, view.camera);
      labels.render(view.scene, view.camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    /** Element that receives pointer input (the label layer sits on top of the canvas). */
    get inputElement() {
      return labels.domElement;
    },
    /** @param {View} next */
    setView(next) {
      view?.dispose?.();
      view = next;
      size();
    },
    /** Run `fn` every animation frame, before the view renders. @param {(dtReal: number) => void} fn */
    onFrame(fn) {
      frameHooks.push(fn);
    },
    size: () => ({ width: container.clientWidth, height: container.clientHeight }),
  };
}
