// @ts-check
import * as THREE from 'three';

/**
 * Round, anti-aliased points with per-point colour and constant screen size
 * (a vector look that does not blur when zooming). One draw call for all stars.
 * @param {{ positions: Float32Array, colors: Float32Array, sizes: Float32Array, opacity?: number }} opts
 */
export function createStarPoints({ positions, colors, sizes, opacity = 1 }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, opacity: { value: opacity } },
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
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float edge = fwidth(r);
        float alpha = 1.0 - smoothstep(1.0 - edge, 1.0, r);
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(vColor, alpha * opacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}
