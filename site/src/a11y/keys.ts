/** Keyboard beat navigation: arrows / PageUp / PageDown / Home / End move
 * between holds; any nav key first exits free-explore. */

export interface KeyNavApi {
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  /** Returns true if explore was active (and is now exiting). */
  exitExplore(): boolean;
}

export function bindKeys(api: KeyNavApi): () => void {
  const handler = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const nav: Record<string, () => void> = {
      ArrowDown: api.next,
      PageDown: api.next,
      ArrowUp: api.prev,
      PageUp: api.prev,
      Home: api.first,
      End: api.last,
    };
    const fn = nav[e.key];
    if (!fn) return;
    e.preventDefault();
    api.exitExplore();
    fn();
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
