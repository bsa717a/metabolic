import DOMPurify from 'dompurify';

/**
 * Client-side sanitizer for imported/edited email HTML.
 *
 * Uses DOMPurify (stronger than the server's regex pass) while preserving the
 * markup email layouts rely on: tables, inline styles, and base64 `data:` image
 * URIs (DOMPurify permits data: URIs on image sources by default). Scripts,
 * iframes, event handlers, and javascript: URLs are removed.
 *
 * The server still sanitizes on save/send, so this is defense-in-depth, not
 * the only gate.
 */
export const sanitizeCommunicationHtmlClient = (html: string | null | undefined): string => {
  const str = String(html ?? '').trim();
  if (!str) return '';

  // DOMPurify only works with a DOM; this helper should only be invoked from
  // browser code paths.
  if (typeof window === 'undefined' || !DOMPurify.isSupported) return str;

  return DOMPurify.sanitize(str, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'noscript'],
    FORBID_ATTR: ['formaction'],
    // Keep full-document wrappers out; we only want body-level markup for the
    // Unlayer HTML block.
    WHOLE_DOCUMENT: false,
    ALLOW_DATA_ATTR: true
  });
};
