// @ts-check
import * as THREE from 'three';
import { toScene } from '../coords.js';
import { theme } from '../theme.js';

/** Helpers shared by the overlay layers. */
export const P = (/** @type {import('../../core/vec3.js').Vec3} */ v) => toScene(v);

/** @param {string} faction */
export const factionColor = (faction) => theme.factions[/** @type {keyof typeof theme.factions} */ (faction)] ?? theme.factionOther;

/**
 * Colour for information of a given age: the base colour fading to grey; overdue in red.
 * @param {number} age @param {boolean} overdue @param {string} base
 */
export function ageColor(age, overdue, base) {
  if (overdue) return new THREE.Color(theme.info.overdue);
  const f = Math.min(1, Math.max(0, age / theme.staleAfterYears));
  return new THREE.Color(base).lerp(new THREE.Color(theme.info.stale), f * 0.85);
}

/**
 * A pool of CSS2D labels reused frame to frame.
 * @param {THREE.Object3D} parent @param {number} size @param {string} className
 * @param {typeof import('three/addons/renderers/CSS2DRenderer.js').CSS2DObject} CSS2DObject
 */
export function createLabelPool(parent, size, className, CSS2DObject) {
  const pool = Array.from({ length: size }, () => {
    const el = document.createElement('div');
    el.className = className;
    const obj = new CSS2DObject(el);
    obj.center.set(0, 0);
    obj.visible = false;
    parent.add(obj);
    return obj;
  });
  return {
    /** @param {{ pos: THREE.Vector3, text: string, cls?: string }[]} items */
    set(items) {
      pool.forEach((obj, i) => {
        const item = items[i];
        obj.visible = !!item;
        if (!item) return;
        obj.position.copy(item.pos);
        if (obj.element.textContent !== item.text) obj.element.textContent = item.text;
        const cls = `${className} ${item.cls ?? ''}`.trim();
        if (obj.element.className !== cls) obj.element.className = cls;
      });
    },
  };
}
