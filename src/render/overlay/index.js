// @ts-check
import * as THREE from 'three';
import { toScene } from '../coords.js';
import { createNetworkLayer } from './networkLayer.js';
import { createPresenceLayer } from './presenceLayer.js';
import { createMessageLayer } from './messageLayer.js';
import { createFleetLayer } from './fleetLayer.js';
import { createSightingLayer } from './sightingLayer.js';
import { createWormholeLayer } from './wormholeLayer.js';

/**
 * @typedef {'spectral' | 'status' | 'age'} ColourBy
 * @typedef {{ network: boolean, ranges: boolean, colourBy: ColourBy }} OverlayOptions
 */

/**
 * Everything drawn over the star map from a Picture (src/perspective/picture.js).
 * Each layer is independent; this only wires them together.
 * @param {{ scene: THREE.Scene, catalog: import('../../galaxy/catalog.js').Catalog }} deps
 */
export function createInfoOverlay({ scene, catalog }) {
  const S = (/** @type {string} */ id) => toScene(catalog.get(id).pos);
  const name = (/** @type {string} */ id) => catalog.get(id).name;
  const network = createNetworkLayer(S);
  const presence = createPresenceLayer(S);
  const messages = createMessageLayer();
  const fleets = createFleetLayer(name);
  const sightings = createSightingLayer(name);
  const wormholes = createWormholeLayer(S);
  const root = new THREE.Group();
  root.add(network.object, wormholes.object, presence.object, messages.object, sightings.object, fleets.object);
  scene.add(root);
  return {
    /** @param {import('../../perspective/picture.js').Picture} pic @param {OverlayOptions} opts */
    update(pic, opts) {
      network.update(pic, opts);
      presence.update(pic, opts);
      messages.update(pic);
      fleets.update(pic);
      sightings.update(pic);
      wormholes.update(pic);
    },
  };
}
