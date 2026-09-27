// @ts-check
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { theme } from '../theme.js';
import { createDynamicPoints, createSegments } from '../dynamicPoints.js';
import { P, factionColor, createLabelPool } from './common.js';
import { add, scale, normalize, sub } from '../../core/vec3.js';

const AUTO_LABEL_LY = 10;
const AUTO_LABEL_MAX = 16;

/**
 * @param {import('../../perspective/picture.js').PicFleet[]} fleets
 * @param {{ labelMode: 'auto' | 'all' | 'none', focus: THREE.Vector3 }} opts
 */
function labelled(fleets, opts) {
  if (opts.labelMode === 'none') return [];
  if (opts.labelMode === 'all') return fleets;
  const near = fleets
    .map((f) => ({ f, d: P(f.pos).distanceTo(opts.focus) }))
    .filter(({ f, d }) => f.ansible || d <= AUTO_LABEL_LY)
    .sort((a, b) => Number(b.f.ansible) - Number(a.f.ansible) || a.d - b.d);
  return near.slice(0, AUTO_LABEL_MAX).map(({ f }) => f);
}

/**
 * Fleets, drawn so certainty is visible at a glance:
 * - solid diamond: known now (live, confirmed, or truth);
 * - hollow diamond: predicted from an old report (expected / unconfirmed);
 * - grey dot and dotted line: where it was when last reported;
 * - dashed line: the remaining planned route;
 * - truth view: an orange streak for engines burning (the visible plume).
 * @param {(f: import('../../perspective/picture.js').PicFleet) => string} label  text next to each fleet (from the UI)
 */
export function createFleetLayer(label) {
  const group = new THREE.Group();
  const solid = createDynamicPoints({ capacity: 256, shape: 'diamond' });
  const hollow = createDynamicPoints({ capacity: 256, shape: 'diamondRing' });
  const confirmed = createDynamicPoints({ capacity: 256, opacity: 0.8 });
  const paths = createSegments({ color: theme.text, opacity: 0.5, dashed: true, dash: 0.5 });
  const lag = createSegments({ color: theme.textDim, opacity: 0.6, dashed: true, dash: 0.15 });
  const jumps = createSegments({ color: theme.info.wormhole, opacity: 0.7, dashed: true, dash: 0.3 });
  const plumes = createSegments({ color: theme.info.plume, opacity: 0.95 });
  group.add(paths.object, lag.object, jumps.object, plumes.object, confirmed.object, hollow.object, solid.object);
  const labels = createLabelPool(group, 64, 'star-label fleet-label', CSS2DObject);

  /** @param {import('../../perspective/picture.js').PicFleet} f */
  const colour = (f) => (f.ansible ? theme.info.ansible : factionColor(f.empire));
  const predicted = (/** @type {import('../../perspective/picture.js').PicFleet} */ f) => f.certainty === 'expected' || f.certainty === 'unconfirmed';

  return {
    object: group,
    /**
     * @param {import('../../perspective/picture.js').Picture} pic
     * @param {{ labelMode: 'auto' | 'all' | 'none', focus: THREE.Vector3 }} opts  'auto' labels only fleets near the view centre (and ansible fleets)
     */
    update(pic, opts) {
      solid.set(pic.fleets.filter((f) => !predicted(f)).map((f) => ({ pos: P(f.pos), color: colour(f), size: 12 })));
      hollow.set(pic.fleets.filter(predicted).map((f) => ({ pos: P(f.pos), color: f.certainty === 'unconfirmed' ? theme.info.overdue : colour(f), size: 14 })));
      confirmed.set(pic.fleets.filter(predicted).map((f) => ({ pos: P(f.confirmedPos), color: theme.textDim, size: 5 })));
      lag.set(pic.fleets.filter(predicted).flatMap((f) => [P(f.confirmedPos), P(f.pos)]));
      paths.set(pic.fleets.flatMap((f) => f.path.slice(1).flatMap((p, i) => [P(f.path[i]), P(p)])));
      jumps.set(pic.fleets.flatMap((f) => f.wormholeJumps.flatMap(([a, b]) => [P(a), P(b)])));
      plumes.set(pic.fleets.filter((f) => f.burning && f.path.length > 1).flatMap((f) => {
        const dir = normalize(sub(f.path[1], f.pos));
        const exhaust = f.burning === 'accelerating' ? scale(dir, -1) : dir;
        return [P(f.pos), P(add(f.pos, scale(exhaust, 1.2)))];
      }));
      labels.set(labelled(pic.fleets, opts).map((f) => ({ pos: P(f.pos), text: label(f), cls: f.certainty })));
    },
  };
}
