// @ts-check
import * as THREE from 'three';

/**
 * Round, anti-aliased points with per-point colour and constant screen size
 * (a vector look that does not blur when zooming). One draw call for all stars.
 * Shapes: 'disc' (filled), 'ring' (outline), 'diamond' (filled rhombus), 'diamondRing' (rhombus outline).
 * @typedef {'disc' | 'ring' | 'diamond' | 'diamondRing'} PointShape
 * @param {{ positions: Float32Array, colors: Float32Array, sizes: Float32Array, opacity?: number, shape?: PointShape }} opts
 */
export function createStarPoints({ positions, colors, sizes, opacity = 1, shape = 'disc' }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      opacity: { value: opacity },
      shape: { value: { disc: 0, ring: 1, diamond: 2, diamondRing: 3 }[shape] },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float pixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = size * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform int shape;
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = shape >= 2 ? (abs(c.x) + abs(c.y)) * 2.0 : length(c) * 2.0;
        float edge = fwidth(r);
        float alpha = 1.0 - smoothstep(1.0 - edge, 1.0, r);
        if (shape == 1 || shape == 3) alpha *= smoothstep(0.6 - edge, 0.6, r);
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(vColor, alpha * opacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}
