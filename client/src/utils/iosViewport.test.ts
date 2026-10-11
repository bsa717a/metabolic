import { describe, expect, it } from 'vitest';
import {
  clearZoomViewportContent,
  isStuckInputZoom,
  viewportDisablesAccessibilityZoom
} from './iosViewport';

const WEBSITE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

describe('iOS stuck focus zoom', () => {
  it('treats the small focus-zoom band as stuck and leaves a large pinch alone', () => {
    expect(isStuckInputZoom(1)).toBe(false);
    expect(isStuckInputZoom(1.01)).toBe(false);
    expect(isStuckInputZoom(16 / 14)).toBe(true);
    expect(isStuckInputZoom(1.4)).toBe(true);
    expect(isStuckInputZoom(2)).toBe(false);
  });

  it('does not treat the website viewport as locked, and can clear a stuck zoom for one frame', () => {
    expect(viewportDisablesAccessibilityZoom(WEBSITE_VIEWPORT)).toBe(false);
    expect(viewportDisablesAccessibilityZoom('width=device-width, initial-scale=1, user-scalable=no')).toBe(true);
    expect(viewportDisablesAccessibilityZoom('width=device-width, maximum-scale=1')).toBe(true);
    expect(clearZoomViewportContent(WEBSITE_VIEWPORT)).toBe(`${WEBSITE_VIEWPORT}, maximum-scale=1`);
    expect(viewportDisablesAccessibilityZoom(clearZoomViewportContent(WEBSITE_VIEWPORT))).toBe(true);
  });
});
