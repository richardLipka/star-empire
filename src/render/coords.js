// @ts-check
import * as THREE from 'three';

/**
 * Game space is galactic (x → galactic centre, y → rotation, z → north pole).
 * Three.js is y-up, so the galactic plane maps onto the scene's x/z plane.
 * @param {import('../core/vec3.js').Vec3} p
 * @param {THREE.Vector3} [out]
 */
export const toScene = (p, out = new THREE.Vector3()) => out.set(p[0], p[2], -p[1]);
