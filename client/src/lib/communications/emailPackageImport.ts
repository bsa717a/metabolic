import JSZip from 'jszip';

/**
 * Client-side importer for uploaded email HTML.
 *
 * Accepts a single `.html`/`.htm` file or a `.zip` containing the HTML plus its
 * images. Zip images are embedded as base64 `data:` URIs so the Unlayer editor
 * (a cross-origin iframe) renders them immediately with no server round-trip. At
 * send time the backend converts those data URIs into CID inline attachments
 * so they also render in recipients' inboxes.
 *
 * Uses browser-only APIs (DOMParser, FileReader, Blob) — call from the client.
 */

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const HTML_EXTENSIONS = ['html', 'htm'];

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
};

export interface HtmlEntry {
  path: string;
  text: string;
}

export interface EmailPackage {
  htmlEntries: HtmlEntry[];
  assets: Map<string, Blob>;
}

export interface ImportEmailResult {
  html: string;
  embedded: number;
  unresolved: number;
  sourceName: string;
}

const getExtension = (name = ''): string => (name.split('.').pop() || '').toLowerCase();

const stripQuery = (value = ''): string => value.split('?')[0].split('#')[0];

const normalizePath = (value = ''): string =>
  stripQuery(value)
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '');

const basename = (value = ''): string => normalizePath(value).split('/').pop() || '';

const dirname = (value = ''): string => {
  const parts = normalizePath(value).split('/');
  parts.pop();
  return parts.join('/');
};

const joinPath = (dir: string, rel: string): string => {
  const segments = `${dir ? `${dir}/` : ''}${rel}`.split('/');
  const out: string[] = [];
  segments.forEach((segment) => {
    if (segment === '' || segment === '.') return;
    if (segment === '..') {
      out.pop();
      return;
    }
    out.push(segment);
  });
  return out.join('/');
};

const isZipFile = (file: File): boolean =>
  /\.zip$/i.test(file?.name || '') || file?.type === 'application/zip' || file?.type === 'application/x-zip-compressed';

/**
 * Read an uploaded file (zip or single .html) into HTML candidates + image assets.
 */
export const extractEmailPackage = async (file: File): Promise<EmailPackage> => {
  if (!isZipFile(file)) {
    const text = await file.text();
    return {
      htmlEntries: [{ path: file.name || 'index.html', text }],
      assets: new Map()
    };
  }

  const zip = await JSZip.loadAsync(file);
  const htmlEntries: HtmlEntry[] = [];
  const assets = new Map<string, Blob>();

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  await Promise.all(
    entries.map(async (entry) => {
      const ext = getExtension(entry.name);
      if (HTML_EXTENSIONS.includes(ext)) {
        const text = await entry.async('string');
        htmlEntries.push({ path: entry.name, text });
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        const blob = await entry.async('blob');
        assets.set(normalizePath(entry.name), blob);
      }
    })
  );

  return { htmlEntries, assets };
};

const decodeHtmlEntities = (value = ''): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * Resolve DesignCode/Affinity ("x-dc") template source into plain email HTML.
 * These exports keep `{{ prop }}` expressions, `<sc-if>` conditionals and a
 * `<script type="text/x-dc" data-dc-script>` block that defines prop defaults
 * and a renderVals() mapping. We read those, substitute the prop values, and
 * evaluate the conditionals so the result is a clean email. Canonical merge
 * tokens the author mapped to (e.g. {{recipient_name}}, {{unsubscribe_url}})
 * are preserved for per-recipient substitution at send time.
 *
 * Defensive: returns the input unchanged if the template isn't a DC export or
 * anything fails to parse.
 */
export const resolveDesignCodeTemplate = (html: string): string => {
  try {
    const propsMatch = html.match(/data-props="([\s\S]*?)"\s*>/i);
    const scriptMatch = html.match(/<script\b[^>]*\bdata-dc-script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (!propsMatch && !scriptMatch) return html;

    const valueMap: Record<string, string | number | boolean> = {};

    if (propsMatch) {
      try {
        const props = JSON.parse(decodeHtmlEntities(propsMatch[1])) as Record<
          string,
          { default?: string | number | boolean }
        >;
        Object.entries(props).forEach(([key, def]) => {
          if (def && typeof def === 'object' && 'default' in def) {
            valueMap[key] = def.default as string | number | boolean;
          }
        });
      } catch {
        // Ignore malformed props; renderVals may still provide values.
      }
    }

    if (scriptMatch) {
      // The object literal ends with "};" — match to that terminator so
      // values containing braces (e.g. '{{recipient_name}}') aren't truncated.
      const returnBlock =
        scriptMatch[1].match(/return\s*\{([\s\S]*?)\}\s*;/) || scriptMatch[1].match(/return\s*\{([\s\S]*)\}/);
      const block = returnBlock ? returnBlock[1] : '';
      const assignment = /(\w+)\s*:\s*(?:this\.props\.(\w+)\s*\?\?\s*)?('([^']*)'|"([^"]*)"|true|false|[\d.]+)/g;
      let match: RegExpExecArray | null;
      while ((match = assignment.exec(block)) !== null) {
        const [, key, propRef, literal, single, double] = match;
        let value: string | number | boolean;
        if (literal === 'true') value = true;
        else if (literal === 'false') value = false;
        else if (/^[\d.]+$/.test(literal)) value = Number(literal);
        else value = single !== undefined ? single : double;

        if (propRef && valueMap[propRef] !== undefined) {
          value = valueMap[propRef];
        }
        valueMap[key] = value;
      }
    }

    let output = html;

    // Evaluate <sc-if value="{{ key }}">…</sc-if> conditionals.
    output = output.replace(
      /<sc-if\b[^>]*\bvalue="\{\{\s*(\w+)\s*\}\}"[^>]*>([\s\S]*?)<\/sc-if>/gi,
      (_full, key: string, inner: string) => (valueMap[key] ? inner : '')
    );
    output = output.replace(/<\/?sc-if\b[^>]*>/gi, '');

    // Substitute known prop tokens (e.g. {{ accent }} -> #1a9e89,
    // {{ recipientName }} -> {{recipient_name}}).
    Object.entries(valueMap).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      output = output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value));
    });

    return output;
  } catch {
    return html;
  }
};

const countMatches = (text: string, regex: RegExp): number => (text.match(regex) || []).length;

/**
 * Pick the cleanest renderable HTML candidate from a package.
 * Penalizes editor/source formats (template placeholders, content-id refs) and
 * prefers files whose images can actually be resolved.
 */
export const pickBestHtml = (htmlEntries: HtmlEntry[], assets: Map<string, Blob>): HtmlEntry | null => {
  if (!htmlEntries.length) return null;
  if (htmlEntries.length === 1) return htmlEntries[0];

  const assetBasenames = new Set([...assets.keys()].map((key) => basename(key)));

  const scored = htmlEntries.map((entry) => {
    const { text } = entry;
    let score = 0;

    if (/\{\{[^}]+\}\}/.test(text)) score -= 100;
    const srcs = text.match(/src\s*=\s*["']([^"']+)["']/gi) || [];
    const cidRefs = srcs.filter((s) => /src\s*=\s*["'][0-9a-f-]{16,}["']/i.test(s)).length;
    score -= cidRefs * 10;

    const base64Count = countMatches(text, /src\s*=\s*["']data:image\//gi);
    const resolvableRelative = srcs.filter((s) => {
      const url = s.replace(/^src\s*=\s*["']/i, '').replace(/["']$/, '');
      if (/^(https?:|data:|cid:)/i.test(url) || /^[0-9a-f-]{16,}$/i.test(url)) return false;
      return assetBasenames.has(basename(url));
    }).length;

    score += resolvableRelative * 5;
    score += base64Count * 2;
    score -= text.length / 100000;

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].entry;
};

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });

const resolveAsset = (rawSrc: string, htmlDir: string, assets: Map<string, Blob>): Blob | null => {
  const normalized = normalizePath(rawSrc);
  const candidates = [joinPath(htmlDir, normalized), normalized];
  for (const candidate of candidates) {
    if (assets.has(candidate)) return assets.get(candidate) as Blob;
  }
  const target = basename(rawSrc);
  for (const [key, blob] of assets.entries()) {
    if (basename(key) === target) return blob;
  }
  return null;
};

const REWRITE_ATTRS = ['src', 'background'];

// Inline styles at/above this px width are treated as a layout container width
// and made fluid (width:100% + max-width). Smaller fixed widths (icons, spacer
// columns, stat cells) are intentional and left alone.
const FLUID_WIDTH_THRESHOLD = 480;

const parseStyle = (style: string | null): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!style) return map;
  style.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop) map[prop] = value;
  });
  return map;
};

const serializeStyle = (map: Record<string, string>): string =>
  Object.entries(map)
    .map(([prop, value]) => `${prop}:${value}`)
    .join('; ');

const pxValue = (value = ''): number | null => {
  const match = /^(\d+(?:\.\d+)?)px$/i.exec(String(value).trim());
  return match ? Number(match[1]) : null;
};

const POSITION_PROPS = ['position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index'];

/**
 * Rewrite imported web/Apple-Mail HTML so it also renders in Outlook, whose
 * engine ignores max-width, object-fit, position:absolute and box-shadow, and
 * does not auto-shrink fixed-width layouts on mobile.
 */
const applyOutlookCompat = (doc: Document): void => {
  // 1. Normalize cropped / absolutely-positioned images to fluid flow images,
  //    and unclamp any positioned parent that would otherwise clip them.
  doc.querySelectorAll('img').forEach((img) => {
    const style = parseStyle(img.getAttribute('style'));
    const wasCropped = 'object-fit' in style || (style.position || '').toLowerCase() === 'absolute';

    if (wasCropped) {
      style.height = 'auto';
      style.width = '100%';

      const parent = img.parentElement;
      if (parent) {
        const pStyle = parseStyle(parent.getAttribute('style'));
        const wasContainer = (pStyle.position || '').toLowerCase() === 'relative' || pxValue(pStyle.height);
        if (wasContainer) {
          delete pStyle.overflow;
          if (pxValue(pStyle.height)) delete pStyle.height;
          const nextParent = serializeStyle(pStyle);
          if (nextParent) parent.setAttribute('style', nextParent);
          else parent.removeAttribute('style');
        }
      }
    }

    style.display = style.display || 'block';
    if (!style['max-width']) style['max-width'] = '100%';

    const next = serializeStyle(style);
    if (next) img.setAttribute('style', next);
  });

  // 2. Make large fixed-width containers fluid (width:100% + max-width:Npx).
  doc.querySelectorAll('table, div, td, th').forEach((el) => {
    const widthAttr = el.getAttribute('width');
    const attrPx = widthAttr && /^\d+$/.test(widthAttr) ? Number(widthAttr) : null;

    const style = parseStyle(el.getAttribute('style'));
    const containerPx = Math.max(attrPx || 0, pxValue(style.width) || 0);
    if (containerPx >= FLUID_WIDTH_THRESHOLD) {
      if (attrPx) el.setAttribute('width', '100%');
      style.width = '100%';
      style['max-width'] = `${containerPx}px`;
    }

    const nextStyle = serializeStyle(style);
    if (nextStyle) el.setAttribute('style', nextStyle);
    else if (el.hasAttribute('style')) el.removeAttribute('style');
  });

  // 3. Strip styles Outlook (and often Gmail) ignore: CSS positioning,
  //    object-fit and box-shadow.
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = parseStyle(el.getAttribute('style'));
    let changed = false;
    [...POSITION_PROPS, 'object-fit', 'box-shadow'].forEach((prop) => {
      if (prop in style) {
        delete style[prop];
        changed = true;
      }
    });
    if (!changed) return;
    const next = serializeStyle(style);
    if (next) el.setAttribute('style', next);
    else el.removeAttribute('style');
  });
};

/**
 * Clean non-email markup and embed local images as base64 data URIs.
 * Existing data: URIs and absolute http(s) URLs are kept as-is.
 */
export const cleanAndEmbedHtml = async (
  htmlEntry: HtmlEntry,
  assets: Map<string, Blob>
): Promise<{ html: string; embedded: number; unresolved: number }> => {
  const htmlDir = dirname(htmlEntry.path);
  const resolvedHtml = resolveDesignCodeTemplate(htmlEntry.text);
  const doc = new DOMParser().parseFromString(resolvedHtml, 'text/html');

  doc.querySelectorAll('script, noscript, template, link, meta, title').forEach((node) => node.remove());
  doc.querySelectorAll('x-dc, helmet, dc-helmet').forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  });

  const sourcesToResolve = new Set<string>();
  const collectSource = (value: string | null): void => {
    if (!value) return;
    // data: images are already inline; absolute/scheme URLs are left as-is.
    if (/^(https?:|cid:|mailto:|tel:|data:)/i.test(value)) return;
    sourcesToResolve.add(value);
  };

  const styleUrlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

  doc.querySelectorAll('[src], [background], [style]').forEach((el) => {
    REWRITE_ATTRS.forEach((attr) => collectSource(el.getAttribute(attr)));
    const style = el.getAttribute('style');
    if (style) {
      let match: RegExpExecArray | null;
      styleUrlRegex.lastIndex = 0;
      while ((match = styleUrlRegex.exec(style)) !== null) collectSource(match[1]);
    }
  });

  const urlMap = new Map<string, string>();
  let embedded = 0;
  let unresolved = 0;

  for (const source of sourcesToResolve) {
    const blob = resolveAsset(source, htmlDir, assets);
    if (!blob) {
      unresolved += 1;
      continue;
    }
    try {
      // Zip blobs have no MIME type; set the correct image type from the
      // extension so the data URI is image/* (the send-time inliner only
      // embeds image/* data URIs, and inboxes need the right type).
      const mime = MIME_BY_EXTENSION[getExtension(basename(source))] || (/^image\//i.test(blob.type) ? blob.type : 'image/png');
      const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
      const dataUri = await blobToDataUri(typed);
      urlMap.set(source, dataUri);
      embedded += 1;
    } catch {
      unresolved += 1;
    }
  }

  doc.querySelectorAll('[src], [background], [style]').forEach((el) => {
    REWRITE_ATTRS.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value && urlMap.has(value)) el.setAttribute(attr, urlMap.get(value) as string);
    });
    const style = el.getAttribute('style');
    if (style) {
      const next = style.replace(styleUrlRegex, (full, url: string) => (urlMap.has(url) ? `url('${urlMap.get(url)}')` : full));
      if (next !== style) el.setAttribute('style', next);
    }
  });

  applyOutlookCompat(doc);

  return { html: doc.body.innerHTML, embedded, unresolved };
};

/**
 * End-to-end import: parse package, pick HTML, clean + embed images inline.
 */
export const importEmailPackage = async (file: File): Promise<ImportEmailResult> => {
  const { htmlEntries, assets } = await extractEmailPackage(file);
  const best = pickBestHtml(htmlEntries, assets);
  if (!best) {
    throw new Error('No HTML file was found in that upload.');
  }
  const { html, embedded, unresolved } = await cleanAndEmbedHtml(best, assets);
  if (!html.trim()) {
    throw new Error('That file did not contain any email content.');
  }
  return { html, embedded, unresolved, sourceName: best.path };
};
