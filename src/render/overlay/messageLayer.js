// @ts-check
import * as THREE from 'three';
import { theme } from '../theme.js';
import { createDynamicPoints, createSegments } from '../dynamicPoints.js';
import { P } from './common.js';

/** Messages in flight: dots on their current hop; stalled ones in red. */
export function createMessageLayer() {
  const group = new THREE.Group();
  const dots = createDynamicPoints({ capacity: 1024 });
  const hops = createSegments({ color: theme.info.report, opacity: 0.16 });
  group.add(hops.object, dots.object);
  /** @param {string} kind */
  const colour = (kind) => (kind === 'report' || kind === 'fleetReport' || kind === 'sighting' ? theme.info.report : kind === 'note' ? theme.info.note : theme.info.order);
  return {
    object: group,
    /** @param {import('../../perspective/picture.js').Picture} pic */
    update(pic) {
      dots.set(pic.messages.map((m) => ({ pos: P(m.pos), color: m.stalled ? theme.info.overdue : colour(m.kind), size: m.stalled ? 6 : 5 })));
      hops.set(pic.messages.filter((m) => !m.stalled).flatMap((m) => [P(m.fromPos), P(m.toPos)]));
    },
  };
}
