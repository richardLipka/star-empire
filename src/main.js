// @ts-check
import './ui/style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createShell } from './ui/shell.js';
import { createViewport } from './render/viewport.js';
import { createReferencePlane } from './render/referencePlane.js';
import { theme } from './render/theme.js';

const shell = createShell(/** @type {HTMLElement} */ (document.getElementById('app')));
const viewport = createViewport(shell.viewport);

const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.bg);
scene.add(createReferencePlane({ radius: 50 }));
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
camera.position.set(0, 45, 90);
const controls = new OrbitControls(camera, viewport.inputElement);
controls.enableDamping = true;

viewport.setView({
  scene,
  camera,
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
  update: () => controls.update(),
});

shell.side.innerHTML = '<h2>Sol</h2><p class="hint">Scaffolding (M0). The galaxy arrives in M2.</p>';
