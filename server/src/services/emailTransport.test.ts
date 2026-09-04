import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEmailFrom, toResendAttachments } from './emailTransport.js';

describe('emailTransport', () => {
  it('formats a named from address', () => {
    assert.equal(formatEmailFrom('hello@example.com', 'Metabolic'), 'Metabolic <hello@example.com>');
  });

  it('omits the display name when it is blank', () => {
    assert.equal(formatEmailFrom('hello@example.com', '  '), 'hello@example.com');
  });

  it('maps inline CID attachments for Resend', () => {
    const [attachment] = toResendAttachments([
      {
        name: 'welcome-dashboard.png',
        contentType: 'image/png',
        contentBytes: 'abc123',
        contentId: 'welcome-dashboard',
        isInline: true
      }
    ]);

    assert.deepEqual(attachment, {
      filename: 'welcome-dashboard.png',
      content: 'abc123',
      contentType: 'image/png',
      contentId: 'welcome-dashboard'
    });
  });

  it('omits contentId when the attachment is not inline', () => {
    const [attachment] = toResendAttachments([
      {
        name: 'plan.pdf',
        contentType: 'application/pdf',
        contentBytes: 'pdf'
      }
    ]);

    assert.equal('contentId' in attachment, false);
    assert.equal(attachment.filename, 'plan.pdf');
  });
});
