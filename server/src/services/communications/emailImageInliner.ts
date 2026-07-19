import {
  COMMUNICATION_ASSET_PREFIX,
  downloadCommunicationAsset
} from './storage.js';
import type { EmailAttachment } from './types.js';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
};

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico'
};

const guessContentType = (key: string): string => {
  const ext = (key.split('.').pop() || '').toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';
};

export const extractAssetKey = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('cid:') || url.startsWith('data:')) return null;

  const proxyMatch = url.match(/\/api\/communication-assets\/([^?#"']+)/i);
  const gcsMatch = url.match(/\/communication-assets\/([^?#"']+)/i);
  const raw = proxyMatch?.[1] || gcsMatch?.[1];
  if (!raw) return null;

  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    key = raw;
  }
  if (!key || key.includes('..') || key.includes('\0')) return null;
  // Strip prefix if present in key
  if (key.startsWith(COMMUNICATION_ASSET_PREFIX)) {
    key = key.slice(COMMUNICATION_ASSET_PREFIX.length);
  }
  return key;
};

const collectImageUrls = (html: string): string[] => {
  const urls = new Set<string>();
  const imgSrc = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  const bgAttr = /\bbackground\s*=\s*["']([^"']+)["']/gi;
  const bgUrl = /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

  let match: RegExpExecArray | null;
  while ((match = imgSrc.exec(html)) !== null) urls.add(match[1]);
  while ((match = bgAttr.exec(html)) !== null) urls.add(match[1]);
  while ((match = bgUrl.exec(html)) !== null) urls.add(match[1]);

  return [...urls];
};

const parseDataUri = (uri: string): { buffer: Buffer; contentType: string } | null => {
  const match = /^data:([^;,]*?)(;base64)?,([\s\S]*)$/i.exec(uri);
  if (!match) return null;
  const contentType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3];
  try {
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
    if (!buffer.length) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
};

export const inlineEmailImages = async (
  html: string | null | undefined
): Promise<{ html: string; attachments: EmailAttachment[] }> => {
  if (!html || typeof html !== 'string') {
    return { html: html || '', attachments: [] };
  }

  const urls = collectImageUrls(html);
  if (urls.length === 0) {
    return { html, attachments: [] };
  }

  let output = html;
  const attachments: EmailAttachment[] = [];
  let index = 0;

  const addAttachment = (buffer: Buffer, contentType: string, baseName: string): string => {
    const contentId = `img-${index}-${Date.now()}@metabolic`;
    index += 1;
    const ext = EXT_BY_CONTENT_TYPE[contentType] || 'png';
    attachments.push({
      name: /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.${ext}`,
      contentType,
      contentBytes: buffer.toString('base64'),
      contentId,
      isInline: true
    });
    return contentId;
  };

  for (const url of urls) {
    if (/^data:/i.test(url)) {
      const parsed = parseDataUri(url);
      if (!parsed || !/^image\//i.test(parsed.contentType)) continue;
      const contentId = addAttachment(parsed.buffer, parsed.contentType, `image-${index}`);
      output = output.split(url).join(`cid:${contentId}`);
      continue;
    }

    const key = extractAssetKey(url);
    if (!key) continue;

    try {
      const { buffer, contentType } = await downloadCommunicationAsset(key);
      const baseName = key.split('/').pop() || `image-${index}`;
      const contentId = addAttachment(buffer, contentType || guessContentType(key), baseName);
      output = output.split(url).join(`cid:${contentId}`);
    } catch {
      // Leave the original URL in place as a fallback.
    }
  }

  return { html: output, attachments };
};
