/** Focus-zoom from a sub-16px control lands in this band. A deliberate pinch is larger. */
const STUCK_INPUT_ZOOM_MAX = 1.4;

export function isStuckInputZoom(scale: number) {
  return Number.isFinite(scale) && scale > 1.01 && scale <= STUCK_INPUT_ZOOM_MAX;
}

/** True when the viewport meta would block pinch zoom on the mobile website. */
export function viewportDisablesAccessibilityZoom(content: string) {
  return (
    /user-scalable\s*=\s*(?:no|0)(?:\s|,|$)/i.test(content) ||
    /maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|$)/i.test(content)
  );
}

/** One-frame content that clears a stuck focus zoom. Caller must restore the original. */
export function clearZoomViewportContent(content: string) {
  return `${content}, maximum-scale=1`;
}

function viewportMeta() {
  return document.querySelector('meta[name="viewport"]');
}

/**
 * iOS keeps a focus zoom after blur. Briefly lock scale to 1, then restore the
 * original viewport meta so pinch zoom still works on the website.
 */
export function releaseStuckInputZoom() {
  const scale = window.visualViewport?.scale ?? 1;
  if (!isStuckInputZoom(scale)) return;
  const meta = viewportMeta();
  if (!meta) return;
  const content = meta.getAttribute('content') ?? '';
  if (!content || viewportDisablesAccessibilityZoom(content)) return;
  const locked = clearZoomViewportContent(content);
  meta.setAttribute('content', locked);
  requestAnimationFrame(() => {
    if (meta.getAttribute('content') === locked) meta.setAttribute('content', content);
  });
}

/** Drop horizontal pan and a stuck focus-zoom when the route changes. */
export function resetRouteViewport(main: HTMLElement | null) {
  main?.scrollTo(0, 0);
  if (main) main.scrollLeft = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches('input, select, textarea')) {
    active.blur();
  }
  releaseStuckInputZoom();
}

/** Clear a stuck focus zoom when a text control blurs, without waiting for navigation. */
export function bindIosViewportGuards() {
  const onFocusOut = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches('input, select, textarea')) return;
    requestAnimationFrame(() => releaseStuckInputZoom());
  };
  document.addEventListener('focusout', onFocusOut, true);
  return () => document.removeEventListener('focusout', onFocusOut, true);
}
