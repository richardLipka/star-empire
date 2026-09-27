// @ts-check
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { theme } from '../theme.js';
import { createDynamicPoints, createSegments } from '../dynamicPoints.js';
import { P, factionColor, createLabelPool } from './common.js';
import { describeSighting } from '../../perspective/describe.js';
import { add, scale } from '../../core/vec3.js';

/** Drive plumes the capital has heard about: a flash where the burn was and an arrow along the motion. */
export function createSightingLayer(/** @type {(id: string) => string} */ name) {
  const group = new THREE.Group();
  const flashes = createDynamicPoints({ capacity: 256, shape: 'ring' });
  const arrows = createSegments({ color: theme.info.plume, opacity: 0.8 });
  group.add(arrows.object, flashes.object);
  const labels = createLabelPool(group, 32, 'star-label sighting-label', CSS2DObject);
  return {
    object: group,
    /** @param {import('../../perspective/picture.js').Picture} pic */
    update(pic) {
      const shown = pic.sightings.filter((s) => !s.own || s.phase === 'braking');
      flashes.set(shown.map((s) => ({ pos: P(s.pos), color: s.own ? theme.info.plume : factionColor(s.fleetEmpire), size: s.own ? 10 : 16 })));
      arrows.set(shown.flatMap((s) => [P(s.pos), P(add(s.pos, scale(s.motion, 2.5)))]));
      labels.set(shown.filter((s) => !s.own).slice(-32).map((s) => ({ pos: P(s.pos), text: describeSighting(s, name), cls: 'foreign' })));
    },
  };
}
