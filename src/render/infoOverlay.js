// @ts-check
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { theme } from './theme.js';
import { toScene } from './coords.js';
import { createDynamicPoints, createSegments } from './dynamicPoints.js';
import { formatDuration, formatYear } from '../core/time.js';

/**
 * @typedef {{ network: boolean, ranges: boolean, age: boolean }} OverlayOptions
 * @typedef {Map<string, { suffix: string, cls: string }>} Annotations
 */

const MAX_POINTS = 1024;
const FLEET_LABELS = 64;

/**
 * Draws a Picture (see src/perspective/picture.js) over the star map:
 * presence and information age, relay network and ranges, messages in flight,
 * fleets and their predicted paths, wormholes.
 * @param {{ scene: THREE.Scene, catalog: import('../galaxy/catalog.js').Catalog, setAnnotations: (a: Annotations) => void }} deps
 */
export function createInfoOverlay({ scene, catalog, setAnnotations }) {
  const root = new THREE.Group();
  root.renderOrder = 3;
  scene.add(root);
  const P = (/** @type {import('../core/vec3.js').Vec3} */ v) => toScene(v);
  const S = (/** @type {string} */ id) => toScene(catalog.get(id).pos);
  const factionColor = (/** @type {string} */ f) => theme.factions[/** @type {keyof typeof theme.factions} */ (f)] ?? theme.text;

  const rangeGroup = new THREE.Group();
  const links = createSegments({ color: theme.accent, opacity: 0.35 });
  const hopLines = createSegments({ color: theme.info.report, opacity: 0.16 });
  const paths = createSegments({ color: theme.text, opacity: 0.55, dashed: true, dash: 0.5 });
  const lagLines = createSegments({ color: theme.textDim, opacity: 0.5, dashed: true, dash: 0.15 });
  const holeLines = createSegments({ color: theme.info.wormhole, opacity: 0.6, dashed: true, dash: 0.8 });
  const presence = createDynamicPoints({ capacity: MAX_POINTS, shape: 'ring' });
  const holes = createDynamicPoints({ capacity: 64, shape: 'ring' });
  const messages = createDynamicPoints({ capacity: MAX_POINTS });
  const fleets = createDynamicPoints({ capacity: 256, shape: 'diamond' });
  const confirmed = createDynamicPoints({ capacity: 256, opacity: 0.7 });
  root.add(rangeGroup, links.object, hopLines.object, paths.object, lagLines.object, holeLines.object,
    presence.object, holes.object, messages.object, confirmed.object, fleets.object);

  const labelPool = Array.from({ length: FLEET_LABELS }, () => {
    const el = document.createElement('div');
    el.className = 'star-label fleet-label';
    const obj = new CSS2DObject(el);
    obj.center.set(0, 0);
    obj.visible = false;
    root.add(obj);
    return obj;
  });

  let linksKey = '';
  let rangesKey = '';
  let holesKey = '';

  /** @param {number} age @param {boolean} overdue @param {string} base */
  function ageColor(age, overdue, base) {
    if (overdue) return new THREE.Color(theme.info.overdue);
    const f = Math.min(1, Math.max(0, age / theme.staleAfterYears));
    return new THREE.Color(base).lerp(new THREE.Color(theme.info.stale), f * 0.85);
  }

  /** @param {import('../perspective/picture.js').Picture} pic @param {number} range @param {string} color */
  function rebuildRanges(pic, range, color) {
    for (const c of rangeGroup.children) {
      const obj = /** @type {THREE.Mesh | THREE.Line} */ (c);
      obj.geometry.dispose();
      /** @type {THREE.Material} */ (obj.material).dispose();
    }
    rangeGroup.clear();
    const sphere = new THREE.SphereGeometry(range, 40, 20);
    const ring = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * range, 0, Math.sin((i / 96) * Math.PI * 2) * range)),
    );
    for (const id of pic.relays) {
      const p = S(id);
      const shell = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.022, depthWrite: false, side: THREE.DoubleSide }));
      shell.position.copy(p);
      const eq = new THREE.Line(ring, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
      eq.position.copy(p);
      rangeGroup.add(shell, eq);
    }
  }

  return {
    /**
     * @param {import('../perspective/picture.js').Picture} pic
     * @param {OverlayOptions} opts
     */
    update(pic, opts) {
      const own = factionColor(pic.empire);

      // Presence, coloured by age of information.
      const annotations = /** @type {Annotations} */ (new Map());
      presence.set(pic.systems.map((s) => {
        const color = opts.age && pic.mode === 'knowledge' ? ageColor(s.age, s.overdue, factionColor(s.owner)) : new THREE.Color(factionColor(s.owner));
        if (s.relay !== 'ok') color.multiplyScalar(0.55);
        if (pic.mode === 'knowledge' && opts.age) {
          const suffix = s.id === pic.capital ? 'now' : `${formatDuration(s.age)}${s.overdue ? ' · overdue' : ''}`;
          annotations.set(s.id, { suffix, cls: s.overdue ? 'overdue' : s.age > theme.staleAfterYears ? 'stale' : 'fresh' });
        } else if (s.relay !== 'ok') {
          annotations.set(s.id, { suffix: 'relay down', cls: 'overdue' });
        } else {
          annotations.set(s.id, { suffix: '', cls: 'fresh' });
        }
        return { pos: S(s.id), color, size: s.id === pic.capital ? 20 : 15 };
      }));
      setAnnotations(annotations);

      // Relay network and ranges.
      links.object.visible = opts.network;
      const lk = pic.links.map(([a, b]) => a + b).join();
      if (lk !== linksKey) {
        linksKey = lk;
        links.set(pic.links.flatMap(([a, b]) => [S(a), S(b)]));
      }
      /** @type {THREE.LineBasicMaterial} */ (links.object.material).color.set(own);
      rangeGroup.visible = opts.ranges;
      const rk = `${pic.range}|${pic.relays.join()}`;
      if (opts.ranges && rk !== rangesKey) {
        rangesKey = rk;
        rebuildRanges(pic, pic.range, own);
      }

      // Messages in flight.
      messages.set(pic.messages.map((m) => ({
        pos: P(m.pos),
        color: m.stalled ? theme.info.overdue : m.kind === 'report' || m.kind === 'fleetReport' ? theme.info.report : m.kind === 'note' ? theme.info.note : theme.info.order,
        size: m.stalled ? 6 : 5,
      })));
      hopLines.set(pic.messages.filter((m) => !m.stalled).flatMap((m) => [P(m.fromPos), P(m.toPos)]));

      // Fleets: diamond at the known or predicted position, dot where last confirmed.
      fleets.set(pic.fleets.map((f) => ({ pos: P(f.pos), color: f.ansible ? theme.info.ansible : factionColor(f.empire), size: 11 })));
      confirmed.set(pic.fleets.filter((f) => !f.live && f.status !== 'docked').map((f) => ({ pos: P(f.confirmedPos), color: theme.textDim, size: 5 })));
      paths.set(pic.fleets.flatMap((f) => f.path.slice(1).flatMap((p, i) => [P(f.path[i]), P(p)])));
      lagLines.set(pic.fleets.filter((f) => !f.live && f.status !== 'docked').flatMap((f) => [P(f.confirmedPos), P(f.pos)]));

      labelPool.forEach((obj, i) => {
        const f = pic.fleets[i];
        obj.visible = !!f;
        if (!f) return;
        obj.position.copy(P(f.pos));
        const dest = f.dest ? catalog.get(f.dest).name : '';
        const where = f.status === 'docked' ? `at ${catalog.get(/** @type {string} */ (f.at)).name}` : f.status === 'unconfirmed' ? `should be at ${dest}` : `→ ${dest} · ETA ${formatYear(/** @type {number} */ (f.eta)).slice(0, 4)}`;
        const age = f.live ? (f.ansible ? 'ansible' : 'now') : `${formatDuration(f.age)} old`;
        const text = `${f.name}${f.ansible ? ' ⌁' : ''}${f.courier ? ' ✉' : ''} ${where} · ${age}`;
        if (obj.element.textContent !== text) obj.element.textContent = text;
      });

      // Wormholes.
      const hk = pic.wormholes.map((w) => w.id).join();
      if (hk !== holesKey) {
        holesKey = hk;
        holes.set(pic.wormholes.flatMap((w) => [
          { pos: S(w.a), color: theme.info.wormhole, size: 24 },
          { pos: S(w.b), color: theme.info.wormhole, size: 24 },
        ]));
        holeLines.set(pic.wormholes.flatMap((w) => [S(w.a), S(w.b)]));
      }
    },
  };
}
