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

/** Keep keyboard-induced document panning out of the independently scrolling app shell. */
export function bindIosViewportGuards() {
  const mobile = window.matchMedia('(max-width: 639px)');
  const viewport = window.visualViewport;
  let frame = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  function restoreOuterScroll() {
    if (!mobile.matches) return;
    // The meal list scrolls in <main>; never reset that user's position here.
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function scheduleRestore() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(restoreOuterScroll);
  }

  function onViewportChange() {
    const active = document.activeElement;
    // Let iOS bring the active field into view while typing.
    if (active instanceof Element && active.matches('input, select, textarea, [contenteditable="true"]')) return;
    scheduleRestore();
  }

  const onFocusOut = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches('input, select, textarea')) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      releaseStuckInputZoom();
      onViewportChange();
    });
    // Keyboard dismissal is animated; a blur-frame reset alone can be overwritten.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(onViewportChange, 400);
  };
  document.addEventListener('focusout', onFocusOut, true);
  viewport?.addEventListener('resize', onViewportChange);
  viewport?.addEventListener('scroll', onViewportChange);
  window.addEventListener('resize', onViewportChange);
  return () => {
    document.removeEventListener('focusout', onFocusOut, true);
    viewport?.removeEventListener('resize', onViewportChange);
    viewport?.removeEventListener('scroll', onViewportChange);
    window.removeEventListener('resize', onViewportChange);
    cancelAnimationFrame(frame);
    clearTimeout(settleTimer);
  };
}
