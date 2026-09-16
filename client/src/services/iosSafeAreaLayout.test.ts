import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readClient(relPath: string) {
  return readFileSync(join(CLIENT_ROOT, relPath), 'utf8');
}

describe('iOS Capacitor safe-area layout', () => {
  it('uses viewport-fit=cover so env(safe-area-inset-*) is non-zero in WKWebView', () => {
    const html = readClient('index.html');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('black-translucent');
  });

  it('disables native content insets so the shell can draw edge-to-edge', () => {
    const config = readClient('capacitor.config.ts');
    expect(config).toMatch(/contentInset:\s*'never'/);
    expect(config).not.toMatch(/contentInset:\s*'automatic'/);
    expect(config).toMatch(/backgroundColor:\s*'#e9ecef'/);
  });

  it('pins WKWebView bounce off in the copied SceneDelegate', () => {
    const scene = readClient('native/SceneDelegate.swift');
    expect(scene).toContain('func disableWebViewOverscroll()');
    expect(scene).toContain('webView.scrollView.bounces = false');
    expect(scene).toContain('webView.scrollView.alwaysBounceVertical = false');
    expect(scene).toContain('webView.scrollView.contentInsetAdjustmentBehavior = .never');
    expect(scene).toContain('disableWebViewOverscroll()');
  });

  it('pads the sticky header and tab bar with safe-area CSS variables', () => {
    const css = readClient('src/index.css');
    expect(css).toContain('--safe-area-top: env(safe-area-inset-top, 0px)');
    expect(css).toContain('--safe-area-bottom: env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('overscroll-behavior: none');

    const topbar = readClient('src/components/layout/Topbar.tsx');
    expect(topbar).toContain('pt-[calc(0.5rem+var(--safe-area-top))]');
    expect(topbar).toContain('sm:pt-[calc(0.75rem+var(--safe-area-top))]');

    const nav = readClient('src/components/layout/MobileBottomNav.tsx');
    expect(nav).toContain('var(--safe-area-bottom)');
    expect(nav).toContain('MOBILE_BOTTOM_NAV_RESERVE');

    const shell = readClient('src/components/layout/AppShell.tsx');
    expect(shell).toContain('overscroll-none');
  });
});
