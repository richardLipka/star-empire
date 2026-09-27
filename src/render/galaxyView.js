// @ts-check
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { theme } from './theme.js';
import { toScene } from './coords.js';
import { createReferencePlane } from './referencePlane.js';
import { createStarPoints } from './starPoints.js';
import { createRingMarker } from './marker.js';
import { magnitudeSize } from './starAppearance.js';

/** Extra text after a star's name, and whether to show its label regardless of the label mode. */
/** @typedef {{ suffix: string, cls: string, force: boolean }} Annotation */

/** @typedef {'auto' | 'all' | 'none'} LabelMode */

const PICK_RADIUS_PX = 14;
const HOVER_RADIUS_PX = 10;
const CLICK_SLOP_PX = 4;
/** In 'auto' label mode, systems this close to the view centre are labelled (ly). */
const LOCAL_LABEL_LY = 9;
/** In 'auto' label mode, named stars at least this bright are always labelled. */
const BRIGHT_ABSMAG = 1.5;


/**
 * The 3D star map: stars, drop lines to the galactic plane, labels, selection
 * and measurement. Pure presentation; it reports user intent through callbacks.
 *
 * @param {object} opts
 * @param {import('../galaxy/catalog.js').Catalog} opts.catalog
 * @param {HTMLElement} opts.inputElement
 * @param {(name: string, system: import('../galaxy/catalog.js').StarSystem) => boolean} opts.isMinorName
 * @param {(id: string | null) => void} opts.onSelect
 * @param {(id: string | null) => void} opts.onMeasure
 * @returns {import('./viewport.js').View & {
 *   select(id: string | null): void,
 *   setMeasure(id: string | null): void,
 *   setLabelMode(mode: LabelMode): void,
 *   focus(id: string): void,
 *   setAnnotations(a: Map<string, Annotation>): void,
 *   setStarAppearance(colors: THREE.Color[], sizes: number[]): void,
 * }}
 */
export function createGalaxyView({ catalog, inputElement, isMinorName, onSelect, onMeasure }) {
  const systems = catalog.systems;
  const radius = catalog.meta.radiusLy;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.bg);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, radius * 12);
  camera.position.set(0, radius * 1.2, radius * 1.9);
  const controls = new OrbitControls(camera, inputElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.5;
  controls.maxDistance = radius * 5;

  scene.add(createReferencePlane({ radius: Math.ceil(radius / 10) * 10 }));
  scene.add(directionLabel('▸ galactic centre', new THREE.Vector3(radius + 6, 0, 0)));

  // --- stars and drop lines -------------------------------------------------
  const scenePos = systems.map((s) => toScene(s.pos));
  const n = systems.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const feet = new Float32Array(n * 3);
  const above = [];
  const below = [];
  const color = new THREE.Color();
  systems.forEach((s, i) => {
    const p = scenePos[i];
    p.toArray(positions, i * 3);
    const primary = s.stars[0];
    color.set(theme.spectral[/** @type {keyof typeof theme.spectral} */ (primary.cls)] ?? theme.spectral['?']);
    color.toArray(colors, i * 3);
    sizes[i] = magnitudeSize(Math.min(...s.stars.map((x) => x.absmag)));
    feet.set([p.x, 0, p.z], i * 3);
    (p.y >= 0 ? above : below).push(p.x, p.y, p.z, p.x, 0, p.z);
  });
  const solIndex = systems.indexOf(catalog.sol);
  sizes[solIndex] = 8;
  color.set(theme.accent).toArray(colors, solIndex * 3);

  const stars = createStarPoints({ positions, colors, sizes });
  stars.renderOrder = 2;
  scene.add(stars);

  const feetColors = new Float32Array(n * 3);
  const dim = new THREE.Color(theme.lineStrong);
  for (let i = 0; i < n; i++) dim.toArray(feetColors, i * 3);
  scene.add(createStarPoints({ positions: feet, colors: feetColors, sizes: new Float32Array(n).fill(2.5), opacity: 0.8 }));

  const aboveLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(above, 3)),
    new THREE.LineBasicMaterial({ color: theme.lineStrong, transparent: true, opacity: 0.32 }),
  );
  const belowLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(below, 3)),
    new THREE.LineDashedMaterial({ color: theme.line, transparent: true, opacity: 0.5, dashSize: 0.35, gapSize: 0.35 }),
  );
  belowLines.computeLineDistances();
  scene.add(aboveLines, belowLines);

  // --- labels ------------------------------------------------------------------
  /** @type {LabelMode} */
  let labelMode = 'auto';
  const labels = systems.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'star-label';
    el.textContent = s.name;
    if (!isMinorName(s.name, s)) el.classList.add('named');
    const obj = new CSS2DObject(el);
    obj.center.set(0, 1); // anchor at the label's bottom-left; CSS padding offsets it from the star
    obj.position.copy(scenePos[i]);
    scene.add(obj);
    return obj;
  });

  /** @type {Map<string, Annotation>} */
  let annotations = new Map();

  /** @type {number} */ let selected = -1;
  /** @type {number} */ let measured = -1;
  /** @type {number} */ let hovered = -1;

  const brightest = systems.map((s) => Math.min(...s.stars.map((x) => x.absmag)));
  const labelCentre = new THREE.Vector3(Infinity, 0, 0);

  function refreshLabels() {
    labelCentre.copy(controls.target);
    systems.forEach((s, i) => {
      const el = labels[i].element;
      const note = annotations.get(s.id);
      const forced = i === selected || i === measured || i === hovered || i === solIndex || !!note?.force;
      const local = scenePos[i].distanceTo(labelCentre) <= LOCAL_LABEL_LY;
      const auto = local || (brightest[i] <= BRIGHT_ABSMAG && !isMinorName(s.name, s));
      labels[i].visible = forced || labelMode === 'all' || (labelMode === 'auto' && auto);
      el.classList.toggle('selected', i === selected || i === measured);
      const text = note?.suffix ? `${s.name} · ${note.suffix}` : s.name;
      if (el.textContent !== text) el.textContent = text;
      for (const c of ['fresh', 'stale', 'overdue', 'foreign']) el.classList.toggle(c, note?.cls === c);
    });
  }

  // --- selection and measurement ----------------------------------------------
  const selectRing = createRingMarker({ color: theme.accent, radiusPx: 11 });
  const measureRing = createRingMarker({ color: theme.text, radiusPx: 11, dashed: true });
  scene.add(selectRing.object, measureRing.object);

  const measureLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: theme.accent, dashSize: 0.5, gapSize: 0.3 }),
  );
  measureLine.visible = false;
  const measureLabelEl = document.createElement('div');
  measureLabelEl.className = 'star-label selected';
  const measureLabel = new CSS2DObject(measureLabelEl);
  measureLabel.center.set(0, 1);
  measureLabel.visible = false;
  scene.add(measureLine, measureLabel);

  function refreshMeasure() {
    const on = selected >= 0 && measured >= 0 && selected !== measured;
    measureLine.visible = on;
    measureLabel.visible = on;
    measureRing.setPosition(measured >= 0 ? scenePos[measured] : null);
    if (!on) return;
    const a = scenePos[selected];
    const b = scenePos[measured];
    measureLine.geometry.setFromPoints([a, b]);
    measureLine.computeLineDistances();
    measureLabel.position.copy(a).lerp(b, 0.5);
    measureLabelEl.textContent = `${a.distanceTo(b).toFixed(2)} ly`;
  }

  // --- picking -------------------------------------------------------------------
  const projected = new THREE.Vector3();
  /** @param {number} clientX @param {number} clientY @param {number} maxPx */
  function pick(clientX, clientY, maxPx) {
    const rect = inputElement.getBoundingClientRect();
    let best = -1;
    let bestD = maxPx * maxPx;
    for (let i = 0; i < n; i++) {
      projected.copy(scenePos[i]).project(camera);
      if (projected.z > 1) continue; // behind the camera
      const x = ((projected.x + 1) / 2) * rect.width + rect.left;
      const y = ((1 - projected.y) / 2) * rect.height + rect.top;
      const d = (x - clientX) ** 2 + (y - clientY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  let down = { x: 0, y: 0 };
  inputElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  inputElement.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    const i = pick(e.clientX, e.clientY, PICK_RADIUS_PX);
    const id = i >= 0 ? systems[i].id : null;
    if (e.shiftKey && selected >= 0) onMeasure(id);
    else onSelect(id);
  });
  inputElement.addEventListener('dblclick', (e) => {
    const i = pick(e.clientX, e.clientY, PICK_RADIUS_PX);
    if (i >= 0) focusIndex(i);
  });
  let hoverQueued = false;
  inputElement.addEventListener('pointermove', (e) => {
    if (hoverQueued || e.buttons) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const i = pick(e.clientX, e.clientY, HOVER_RADIUS_PX);
      if (i !== hovered) {
        hovered = i;
        inputElement.style.cursor = i >= 0 ? 'pointer' : '';
        refreshLabels();
      }
    });
  });

  // --- camera focus animation -------------------------------------------------
  /** @type {{ from: THREE.Vector3, to: THREE.Vector3, t: number } | null} */
  let focusAnim = null;
  /** @param {number} i */
  function focusIndex(i) {
    focusAnim = { from: controls.target.clone(), to: scenePos[i].clone(), t: 0 };
  }

  let viewportHeight = 1;
  refreshLabels();

  return {
    scene,
    camera,
    resize(w, h) {
      viewportHeight = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    update(dt) {
      if (focusAnim) {
        focusAnim.t = Math.min(1, focusAnim.t + dt * 2.5);
        const k = 1 - (1 - focusAnim.t) ** 3;
        const next = focusAnim.from.clone().lerp(focusAnim.to, k);
        camera.position.add(next.clone().sub(controls.target));
        controls.target.copy(next);
        if (focusAnim.t >= 1) focusAnim = null;
      }
      controls.update();
      if (labelMode === 'auto' && controls.target.distanceTo(labelCentre) > 1) refreshLabels();
      selectRing.update(camera, viewportHeight);
      measureRing.update(camera, viewportHeight);
    },
    dispose() {
      controls.dispose();
    },
    select(id) {
      selected = id ? systems.indexOf(catalog.get(id)) : -1;
      if (selected < 0) measured = -1;
      selectRing.setPosition(selected >= 0 ? scenePos[selected] : null);
      refreshMeasure();
      refreshLabels();
    },
    setMeasure(id) {
      measured = id ? systems.indexOf(catalog.get(id)) : -1;
      refreshMeasure();
      refreshLabels();
    },
    setLabelMode(mode) {
      labelMode = mode;
      refreshLabels();
    },
    focus(id) {
      focusIndex(systems.indexOf(catalog.get(id)));
    },
    setStarAppearance(nextColors, nextSizes) {
      const colorAttr = /** @type {THREE.BufferAttribute} */ (stars.geometry.getAttribute('color'));
      const sizeAttr = /** @type {THREE.BufferAttribute} */ (stars.geometry.getAttribute('size'));
      nextColors.forEach((c, i) => c.toArray(colorAttr.array, i * 3));
      /** @type {Float32Array} */ (sizeAttr.array).set(nextSizes);
      colorAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    },
    setAnnotations(next) {
      const changed = next.size !== annotations.size || [...next].some(([k, v]) => {
        const old = annotations.get(k);
        return !old || old.suffix !== v.suffix || old.cls !== v.cls || old.force !== v.force;
      });
      annotations = next;
      if (changed) refreshLabels();
    },
  };
}

/** @param {string} text @param {THREE.Vector3} pos */
function directionLabel(text, pos) {
  const el = document.createElement('div');
  el.className = 'ring-label';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);
  obj.position.copy(pos);
  return obj;
}
