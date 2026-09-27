// @ts-check
import * as THREE from 'three';
import { createDynamicPoints } from '../dynamicPoints.js';
import { ageColor, factionColor } from './common.js';

/** Rings around held systems: owner colour, faded by the age of the news when showing info age. */
export function createPresenceLayer(/** @type {(id: string) => THREE.Vector3} */ S) {
  const rings = createDynamicPoints({ capacity: 1024, shape: 'ring' });
  return {
    object: rings.object,
    /** @param {import('../../perspective/picture.js').Picture} pic @param {{ colourBy: string }} opts */
    update(pic, opts) {
      rings.set(pic.systems.map((s) => {
        const base = factionColor(s.owner);
        const color = opts.colourBy === 'age' && pic.mode === 'knowledge' ? ageColor(s.age, s.overdue, base) : new THREE.Color(base);
        if (s.relay !== 'ok') color.multiplyScalar(0.55);
        return { pos: S(s.id), color, size: s.id === pic.capital ? 22 : 16 };
      }));
    },
  };
}
