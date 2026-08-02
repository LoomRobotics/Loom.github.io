import * as THREE from "three";

/** Act 4's camera feed: a real frame from worker-001's IMX708, with the real
 * detections the pipeline produced for it. The image renders as a plane
 * parented to the camera (so it always covers the frame, whatever the rails
 * are doing behind it); the boxes are drawn as DOM by the overlay layer,
 * using the same cover-fit maths so they land on the right bricks.
 *
 * `FeedSource` is a seam: swapping the still for a video texture later means
 * changing the texture and nothing else. */

export interface Detection {
  part: string;
  score: number;
  /** Normalized to the frame, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FeedMeta {
  capture_id: string;
  frame: string;
  camera: string;
  width: number;
  height: number;
  hfov_deg: number | null;
  label_source: string;
  scene_type: string;
  detections: Detection[];
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PLANE_DIST = 0.5;

export class FeedSource {
  readonly group = new THREE.Group();
  readonly meta: FeedMeta;
  private readonly mat: THREE.ShaderMaterial;
  private readonly plane: THREE.Mesh;
  private zoom = 1;

  private constructor(meta: FeedMeta, texture: THREE.Texture) {
    this.meta = meta;
    texture.colorSpace = THREE.SRGBColorSpace;
    // The raw capture is a bright white sweep; dropped in raw it would blow
    // out the page. Grade it toward the charcoal palette (desaturate, pull
    // exposure, cool the shadows) so the orange overlay is what carries.
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      uniforms: {
        uMap: { value: texture },
        uOpacity: { value: 0 },
        uTint: { value: new THREE.Color(0xc2cad4) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uOpacity;
        uniform vec3 uTint;
        void main() {
          vec3 c = texture2D(uMap, vUv).rgb;
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(lum), c, 0.82);
          c = pow(c, vec3(1.15)) * uTint;
          // Corner falloff: reads as a lens. Gentle — stacked on the tint and
          // the gamma it was crushing the frame to mud on a phone screen.
          vec2 d = vUv - 0.5;
          c *= 1.0 - 0.45 * dot(d, d);
          // Feathered border: only visible while the frame is pulling in from
          // the lens, where a hard rectangle would read as a pasted-on photo.
          float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          gl_FragColor = vec4(c, uOpacity * smoothstep(0.0, 0.035, edge));
        }
      `,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.plane.position.z = -PLANE_DIST;
    this.plane.renderOrder = 10;
    this.plane.visible = false;
    this.group.add(this.plane);
  }

  static async load(base: string): Promise<FeedSource> {
    const meta = (await fetch(`${base}media/feed.json`).then((r) => {
      if (!r.ok) throw new Error(`feed.json ${r.status}`);
      return r.json();
    })) as FeedMeta;
    const texture = await new THREE.TextureLoader().loadAsync(`${base}media/feed.jpg`);
    return new FeedSource(meta, texture);
  }

  /** alpha 0..1; zoom < 1 pulls the frame in from the lens. */
  set(alpha: number, zoom: number) {
    this.mat.uniforms.uOpacity!.value = alpha;
    this.zoom = zoom;
    this.plane.visible = alpha > 0.004;
  }

  /** Size the plane to cover the current frustum (CSS `background-size: cover`). */
  layout(camera: THREE.PerspectiveCamera) {
    if (!this.plane.visible) return;
    const viewH = 2 * PLANE_DIST * Math.tan((camera.fov * Math.PI) / 360);
    const viewW = viewH * camera.aspect;
    const imageAspect = this.meta.width / this.meta.height;
    const [w, h] =
      camera.aspect > imageAspect ? [viewW, viewW / imageAspect] : [viewH * imageAspect, viewH];
    this.plane.scale.set(w * this.zoom, h * this.zoom, 1);
  }

  /** Where a normalized detection lands on screen, in CSS pixels. */
  boxRect(det: Detection, vw: number, vh: number): ScreenRect {
    const imageAspect = this.meta.width / this.meta.height;
    const cover = vw / vh > imageAspect ? [vw, vw / imageAspect] : [vh * imageAspect, vh];
    const [dw, dh] = cover as [number, number];
    const ox = (vw - dw * this.zoom) / 2;
    const oy = (vh - dh * this.zoom) / 2;
    return {
      x: ox + det.x * dw * this.zoom,
      y: oy + det.y * dh * this.zoom,
      w: det.w * dw * this.zoom,
      h: det.h * dh * this.zoom,
    };
  }

  dispose() {
    (this.mat.uniforms.uMap!.value as THREE.Texture).dispose();
    this.mat.dispose();
    this.plane.geometry.dispose();
  }
}
