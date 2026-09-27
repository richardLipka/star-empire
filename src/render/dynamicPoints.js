// @ts-check
import * as THREE from 'three';
import { createStarPoints } from './starPoints.js';

/**
 * Points whose positions, colours and sizes change every frame, with a fixed
 * capacity (no reallocation while playing).
 * @param {{ capacity: number, shape?: import('./starPoints.js').PointShape, opacity?: number }} opts
 */
export function createDynamicPoints({ capacity, shape = 'disc', opacity = 1 }) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const points = createStarPoints({ positions, colors, sizes, shape, opacity });
  points.frustumCulled = false;
  points.geometry.setDrawRange(0, 0);
  const color = new THREE.Color();
  return {
    object: points,
    /** @param {{ pos: THREE.Vector3, color: string | THREE.Color, size: number }[]} items */
    set(items) {
      const n = Math.min(items.length, capacity);
      for (let i = 0; i < n; i++) {
        items[i].pos.toArray(positions, i * 3);
        color.set(items[i].color).toArray(colors, i * 3);
        sizes[i] = items[i].size;
      }
      const g = points.geometry;
      g.setDrawRange(0, n);
      for (const name of ['position', 'color', 'size']) /** @type {THREE.BufferAttribute} */ (g.getAttribute(name)).needsUpdate = true;
    },
  };
}

/**
 * Line segments rebuilt on demand (dashed or solid).
 * @param {{ color: string, opacity?: number, dashed?: boolean, dash?: number }} opts
 */
export function createSegments({ color, opacity = 1, dashed = false, dash = 0.4 }) {
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: dash, gapSize: dash * 0.8, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
  lines.frustumCulled = false;
  return {
    object: lines,
    /** @param {THREE.Vector3[]} pairs  flat list: a0, b0, a1, b1, ... */
    set(pairs) {
      lines.geometry.dispose();
      lines.geometry = new THREE.BufferGeometry().setFromPoints(pairs);
      if (dashed) lines.computeLineDistances();
    },
  };
}
