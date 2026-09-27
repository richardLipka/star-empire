// @ts-check
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { theme } from './theme.js';

/**
 * Concentric distance rings and radial spokes on the galactic plane,
 * the classic 3D star-map reference. Units are light-years.
 * @param {{ radius: number, step?: number, spokes?: number }} opts
 */
export function createReferencePlane({ radius, step = 10, spokes = 12 }) {
  const group = new THREE.Group();
  const ringMat = new THREE.LineBasicMaterial({ color: theme.line, transparent: true, opacity: 0.8 });
  const spokeMat = new THREE.LineBasicMaterial({ color: theme.line, transparent: true, opacity: 0.45 });

  for (let r = step; r <= radius + 1e-6; r += step) {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));

    const el = document.createElement('div');
    el.className = 'ring-label';
    el.textContent = `${r} ly`;
    const label = new CSS2DObject(el);
    label.position.set(r, 0, 0);
    group.add(label);
  }

  const spokePts = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    spokePts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokePts), spokeMat));
  return group;
}
