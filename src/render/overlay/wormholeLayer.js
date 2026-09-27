// @ts-check
import * as THREE from 'three';
import { theme } from '../theme.js';
import { createDynamicPoints, createSegments } from '../dynamicPoints.js';

/** Wormhole mouths (violet rings) joined by a dashed line: a link, not a path through space. */
export function createWormholeLayer(/** @type {(id: string) => THREE.Vector3} */ S) {
  const group = new THREE.Group();
  const mouths = createDynamicPoints({ capacity: 64, shape: 'ring' });
  const lines = createSegments({ color: theme.info.wormhole, opacity: 0.6, dashed: true, dash: 0.8 });
  group.add(lines.object, mouths.object);
  let key = '';
  return {
    object: group,
    /** @param {import('../../perspective/picture.js').Picture} pic */
    update(pic) {
      const k = pic.wormholes.map((w) => w.id).join();
      if (k === key) return;
      key = k;
      mouths.set(pic.wormholes.flatMap((w) => [S(w.a), S(w.b)].map((pos) => ({ pos, color: theme.info.wormhole, size: 26 }))));
      lines.set(pic.wormholes.flatMap((w) => [S(w.a), S(w.b)]));
    },
  };
}
