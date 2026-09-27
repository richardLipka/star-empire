// @ts-check
import * as THREE from 'three';
import { theme } from '../theme.js';
import { createSegments } from '../dynamicPoints.js';
import { factionColor } from './common.js';

/** Relay links within range, and relay range spheres (the reach of communication). */
export function createNetworkLayer(/** @type {(id: string) => THREE.Vector3} */ S) {
  const group = new THREE.Group();
  const links = createSegments({ color: theme.accent, opacity: 0.35 });
  const exposed = createSegments({ color: theme.info.overdue, opacity: 0.9 });
  const ranges = new THREE.Group();
  group.add(ranges, links.object, exposed.object);
  let exposedKey = '';
  let linksKey = '';
  let rangesKey = '';

  /** @param {string[]} relays @param {number} range @param {string} color */
  function rebuildRanges(relays, range, color) {
    for (const c of ranges.children) /** @type {THREE.Material} */ (/** @type {THREE.Mesh} */ (c).material).dispose();
    ranges.clear();
    const sphere = new THREE.SphereGeometry(range, 40, 20);
    const ring = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * range, 0, Math.sin((i / 96) * Math.PI * 2) * range)),
    );
    for (const id of relays) {
      const p = S(id);
      const shell = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.022, depthWrite: false, side: THREE.DoubleSide }));
      const eq = new THREE.Line(ring, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
      shell.position.copy(p);
      eq.position.copy(p);
      ranges.add(shell, eq);
    }
  }

  return {
    object: group,
    /**
     * @param {import('../../perspective/picture.js').Picture} pic
     * @param {{ network: boolean, ranges: boolean, security?: boolean, exposed?: { a: string, b: string }[] }} opts
     */
    update(pic, opts) {
      exposed.object.visible = !!opts.security;
      const ek = (opts.exposed ?? []).map((e) => e.a + e.b).join();
      if (opts.security && ek !== exposedKey) {
        exposedKey = ek;
        exposed.set((opts.exposed ?? []).flatMap((e) => [S(e.a), S(e.b)]));
      }
      const color = factionColor(pic.empire);
      links.object.visible = opts.network;
      const lk = pic.links.map(([a, b]) => a + b).join();
      if (lk !== linksKey) {
        linksKey = lk;
        links.set(pic.links.flatMap(([a, b]) => [S(a), S(b)]));
      }
      /** @type {THREE.LineBasicMaterial} */ (links.object.material).color.set(color);
      ranges.visible = opts.ranges;
      const rk = `${pic.empire}|${pic.range}|${pic.relays.join()}`;
      if (opts.ranges && rk !== rangesKey) {
        rangesKey = rk;
        rebuildRanges(pic.relays, pic.range, color);
      }
    },
  };
}
