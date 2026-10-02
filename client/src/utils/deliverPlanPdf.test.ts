import { describe, expect, it } from 'vitest';
import { planPdfDeliveryKind } from './deliverPlanPdf';

describe('planPdfDeliveryKind', () => {
  it('shares on the iOS shell only when the WebView can share a file', () => {
    expect(planPdfDeliveryKind({ nativeIos: true, canShareFiles: true })).toBe('share');
    expect(planPdfDeliveryKind({ nativeIos: true, canShareFiles: false })).toBe('download');
  });

  it('downloads on the web', () => {
    expect(planPdfDeliveryKind({ nativeIos: false, canShareFiles: true })).toBe('download');
    expect(planPdfDeliveryKind({ nativeIos: false, canShareFiles: false })).toBe('download');
  });
});
