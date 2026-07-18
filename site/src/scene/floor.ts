import * as THREE from "three";

/** Blueprint-grid arena floor: charcoal base with steel gridlines that fade
 * with distance — the WebGL port of the site's `.arch-teaser` grid-paper
 * panels. Anti-aliased in-shader; no textures. */

export function createBlueprintFloor(size = 30): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(0x15191e) },
      uLine: { value: new THREE.Color(0x5b7a99) },
      uFadeStart: { value: 2.0 },
      uFadeEnd: { value: 9.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform vec3 uBase;
      uniform vec3 uLine;
      uniform float uFadeStart;
      uniform float uFadeEnd;

      float gridLine(vec2 p, float cell) {
        vec2 q = p / cell;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }

      void main() {
        vec2 p = vWorld.xz;
        float fine = gridLine(p, 0.16) * 0.10;
        float major = gridLine(p, 0.80) * 0.16;
        float d = length(vWorld - cameraPosition);
        float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);
        vec3 color = uBase + uLine * (fine + major) * fade;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = "floor";
  return mesh;
}
