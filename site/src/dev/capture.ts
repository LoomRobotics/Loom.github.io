/** DEV-only frame capture: composites the WebGL stage with the DOM overlay
 * (act copy, chrome, pins) into one JPEG and POSTs it to the vite `/__capture`
 * endpoint. Used for visual verification during development, and to export the
 * static-variant stills from each beat's hold pose.
 *
 * The DOM half goes through an SVG <foreignObject>, which is a sandboxed image
 * context: it cannot fetch anything, so every computed style is inlined and the
 * webfonts are embedded as data URIs before serialization. */

let fontCss: string | null = null;

/** Keyframes that fade/slide an element in from nothing. */
const ENTRANCE_ANIMATIONS = new Set(["hero-rise"]);

async function embeddedFontCss(): Promise<string> {
  if (fontCss !== null) return fontCss;
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com"]');
  if (!link) return (fontCss = "");
  try {
    // Served by the dev middleware with every woff2 already inlined — the page
    // itself is not allowed to fetch the font CDN cross-origin.
    fontCss = await (await fetch(`/__fontcss?href=${encodeURIComponent(link.href)}`)).text();
  } catch (err) {
    console.warn("[loom] font embedding failed, capture will use fallback faces", err);
    fontCss = "";
  }
  return fontCss;
}

/** Deep-clone `src` with every computed style pinned inline, so the clone
 * renders identically with no stylesheet available. */
function cloneWithStyles(src: HTMLElement): HTMLElement {
  const clone = src.cloneNode(true) as HTMLElement;
  const srcNodes = [src, ...src.querySelectorAll<HTMLElement>("*")];
  const dstNodes = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  for (let i = 0; i < srcNodes.length; i++) {
    const computed = getComputedStyle(srcNodes[i]!);
    const dst = dstNodes[i]!;
    // `computed.cssText` is empty by spec — copy the properties one by one.
    for (const prop of computed) dst.style.setProperty(prop, computed.getPropertyValue(prop));
    // Entrance animations may be mid-flight (or frozen, when the host pane
    // isn't compositing): pin their settled state rather than bake in a
    // half-faded frame. Only entrances — resetting the transform of a
    // *positioned* animated element (a pulsing graph chip) would move it.
    if (computed.animationName.split(",").some((n) => ENTRANCE_ANIMATIONS.has(n.trim()))) {
      dst.style.setProperty("opacity", "1");
      dst.style.setProperty("transform", "none");
    }
    dst.style.setProperty("animation", "none");
  }
  clone.removeAttribute("hidden");
  return clone;
}

/** btoa over UTF-8 bytes, chunked — spreading a few hundred KB into
 * String.fromCharCode overflows the call stack. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function domLayer(roots: HTMLElement[], w: number, h: number): Promise<HTMLImageElement | null> {
  const visible = roots.filter((r) => r && !r.hidden);
  if (!visible.length) return null;
  // XMLSerializer (not outerHTML) so inline <svg> keeps its namespace: inside
  // a foreignObject an un-namespaced <svg> parses as XHTML and never renders.
  const serializer = new XMLSerializer();
  const inner = visible.map((r) => serializer.serializeToString(cloneWithStyles(r))).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><style type="text/css">${await embeddedFontCss()}</style></defs>` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${w}px;height:${h}px">${inner}</div>` +
    `</foreignObject></svg>`;
  // Must be a data URL: an SVG loaded from a blob: URL taints the canvas in
  // Chrome, and a tainted canvas can't be exported. base64 keeps it compact
  // (percent-encoding the inlined woff2 payloads roughly triples them).
  const url = `data:image/svg+xml;base64,${toBase64(svg)}`;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("[loom] DOM layer failed to rasterize; capturing stage only");
      resolve(null);
    };
    img.src = url;
  });
}

export async function captureComposite(name: string, canvas: HTMLCanvasElement): Promise<string> {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#15191e";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);

  const roots = ["journey-ui", "chrome"]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el);
  const layer = await domLayer(roots, w, h);
  if (layer) ctx.drawImage(layer, 0, 0);

  const base64 = out.toDataURL("image/jpeg", 0.86).split(",")[1]!;
  await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: "POST", body: base64 });
  return `${name}.jpg (${w}x${h})`;
}
