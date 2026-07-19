/** HTML helpers for Message Center email bodies. */

export const isHtmlContent = (value: unknown): boolean => /<[a-z][\s\S]*>/i.test(String(value || ''));

const escapeHtml = (text: unknown): string =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const sanitizeCommunicationHtml = (html: string | null | undefined): string => {
  const str = String(html || '').trim();
  if (!str) return '';

  if (!isHtmlContent(str)) {
    return escapeHtml(str).replace(/\n/g, '<br/>');
  }

  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<\/?(?:svg|math)\b[^>]*>/gi, '')
    // Event handlers / formaction — quoted, unquoted, and without whitespace before =
    .replace(/\s(on\w+|formaction)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(on\w+|formaction)\s*=\s*'[^']*'/gi, '')
    .replace(/\s(on\w+|formaction)\s*=\s*[^\s>]+/gi, '')
    .replace(/\b(on\w+|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Dangerous URL schemes in href/src/action/xlink:href (including entity-obfuscated variants)
    .replace(
      /\b(href|src|action|formaction|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"']*\2/gi,
      '$1="#"'
    )
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
};

const isFullEmailDocument = (html: string): boolean => /<!DOCTYPE/i.test(html) || /<html[\s>]/i.test(html);

export const wrapEmailHtml = (body: string, footerHtml = ''): string => {
  const sanitizedBody = sanitizeCommunicationHtml(body);
  if (!sanitizedBody) return '';

  if (isFullEmailDocument(sanitizedBody)) {
    if (footerHtml && /<\/body>/i.test(sanitizedBody)) {
      return sanitizedBody.replace(/<\/body>/i, `${footerHtml}</body>`);
    }
    return `${sanitizedBody}${footerHtml}`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
${sanitizedBody}
${footerHtml}
</div>
</body>
</html>`;
};

export const htmlToPlainText = (value: string | null | undefined): string => {
  const str = String(value || '').trim();
  if (!str) return '';
  if (!isHtmlContent(str)) return str;

  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const isCommunicationBodyEmpty = (body: string | null | undefined): boolean =>
  !htmlToPlainText(body).trim();
