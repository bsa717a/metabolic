import { afterEach, expect, it, vi } from 'vitest';
import { bindIosViewportGuards } from './iosViewport';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('restores outer scroll after keyboard dismissal without resetting the meal scroller', () => {
  vi.useFakeTimers();
  class TestElement { matches() { return true; } }
  const documentEvents = new EventTarget();
  const viewport = new EventTarget();
  const windowEvents = new EventTarget();
  const outerScroll = vi.fn();
  const mainScroll = vi.fn();
  const doc = Object.assign(documentEvents, {
    activeElement: null as TestElement | null,
    documentElement: { scrollTop: 120 },
    body: { scrollTop: 120 },
    querySelector: () => null,
    main: { scrollTo: mainScroll }
  });
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', Object.assign(windowEvents, {
    visualViewport: viewport,
    matchMedia: () => ({ matches: true }),
    scrollTo: outerScroll
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const cleanup = bindIosViewportGuards();
  doc.activeElement = new TestElement();
  viewport.dispatchEvent(new Event('resize'));
  vi.runAllTimers();
  expect(outerScroll).not.toHaveBeenCalled();

  doc.activeElement = null;
  const blur = new Event('focusout');
  Object.defineProperty(blur, 'target', { value: new TestElement() });
  documentEvents.dispatchEvent(blur);
  vi.advanceTimersByTime(40);
  expect(doc.documentElement.scrollTop).toBe(0);
  expect(mainScroll).not.toHaveBeenCalled();
  doc.documentElement.scrollTop = 90; // Late keyboard animation pans the document again.
  vi.advanceTimersByTime(420);
  expect(doc.documentElement.scrollTop).toBe(0);
  cleanup();
  outerScroll.mockClear();
  viewport.dispatchEvent(new Event('resize'));
  vi.runAllTimers();
  expect(outerScroll).not.toHaveBeenCalled();
});
