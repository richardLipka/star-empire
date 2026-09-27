// @ts-check
import * as THREE from 'three';

/**
 * A screen-facing ring of constant pixel radius, used for selection and
 * measurement markers. Call `update(camera, height)` every frame.
 * @param {{ color: string, radiusPx: number, dashed?: boolean }} opts
 */
export function createRingMarker({ color, radiusPx, dashed = false }) {
  const pts = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(pts);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12 })
    : new THREE.LineBasicMaterial({ color });
  const ring = new THREE.Line(geometry, material);
  if (dashed) ring.computeLineDistances();
  ring.visible = false;
  const tmp = new THREE.Vector3();

  return {
    object: ring,
    /** @param {THREE.Vector3 | null} pos */
    setPosition(pos) {
      ring.visible = !!pos;
      if (pos) ring.position.copy(pos);
    },
    /** @param {THREE.PerspectiveCamera} camera @param {number} viewportHeight */
    update(camera, viewportHeight) {
      if (!ring.visible) return;
      ring.quaternion.copy(camera.quaternion);
      const dist = tmp.copy(ring.position).distanceTo(camera.position);
      const worldPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
      ring.scale.setScalar(radiusPx * worldPerPx);
    },
  };
}
