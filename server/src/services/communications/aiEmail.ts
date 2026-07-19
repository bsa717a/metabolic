import { env } from '../../config/env.js';
import { categoryAllowsUnsubscribe } from './categories.js';
import { sanitizeCommunicationHtml } from './htmlUtils.js';
import { uploadCommunicationAsset } from './storage.js';
import { COMMUNICATION_VARIABLES } from './variables.js';

export interface AiEmailGenerateInput {
  prompt: string;
  existingSubject?: string;
  existingHtml?: string;
  category?: string;
}

export interface AiEmailGenerateResult {
  subject: string;
  html: string;
  imageError?: string;
}

const AI_IMAGE_SRC_PREFIX = 'ai-image:';
const IMG_TAG_RE = /<img\b[^>]*>/gi;

function getBrandLogoUrl(): string {
  // Same asset as BrandLogo in the SPA (`client/public/logo.png`).
  return `${env.CLIENT_URL.replace(/\/$/, '')}/logo.png`;
}

export function extractRequestedImageDescription(prompt: string): string | undefined {
  const text = prompt.trim();
  if (!text) return undefined;
  if (!/\b(photo|picture|image|hero|beach|banner)\b/i.test(text)) return undefined;

  const ofMatch = text.match(/\b(?:photo|picture|image|hero|banner)\s+of\s+([^,.!?]{3,80})/i);
  if (ofMatch?.[1]) return ofMatch[1].trim();

  if (/\bbeach\b/i.test(text)) return 'sunny beach shoreline summer vacation';
  return 'warm inviting lifestyle photo for an email hero';
}

function stripUnsubscribeMarkup(html: string): string {
  return html
    .replace(/<a\b[^>]*\{\{\s*unsubscribe_url\s*\}\}[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, '')
    .replace(/<p\b[^>]*>\s*(?:To stop receiving[\s\S]*?|Unsubscribe\.?)\s*<\/p>/gi, '');
}

function getImgSrc(tag: string): string | null {
  const double = tag.match(/\bsrc\s*=\s*"([^"]*)"/i);
  if (double) return double[1];
  const single = tag.match(/\bsrc\s*=\s*'([^']*)'/i);
  if (single) return single[1];
  return null;
}

function parseAiImagePrompt(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed.toLowerCase().startsWith(AI_IMAGE_SRC_PREFIX)) return null;
  const prompt = trimmed.slice(AI_IMAGE_SRC_PREFIX.length).trim();
  return prompt || null;
}

function replaceImgSrc(tag: string, nextSrc: string): string {
  if (/\bsrc\s*=\s*"/i.test(tag)) return tag.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${nextSrc}"`);
  if (/\bsrc\s*=\s*'/i.test(tag)) return tag.replace(/\bsrc\s*=\s*'[^']*'/i, `src='${nextSrc}'`);
  return tag.replace(/<img\b/i, `<img src="${nextSrc}"`);
}

async function generateAndStoreEmailImage(description: string): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const prompt =
    `Photorealistic email hero photo for a health and fitness coaching brand. ` +
    `Subject: ${description}. No text, watermarks, logos, or people close-up faces. ` +
    `Warm, inviting, professional.`;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      n: 1,
      size: '1536x1024'
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = json.data?.[0];
  let buffer: Buffer | null = null;
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error('Failed to download generated image');
    buffer = Buffer.from(await imgRes.arrayBuffer());
  }
  if (!buffer) throw new Error('Image generation returned no image data');

  return uploadCommunicationAsset(buffer, 'image/png');
}

async function resolveAiEmailImages(
  html: string,
  options: { ensureDescription?: string } = {}
): Promise<{ html: string; imageError?: string }> {
  let working = html;
  let imageError: string | undefined;
  const logoUrl = getBrandLogoUrl();

  const isLogoSrc = (src: string) =>
    src === logoUrl ||
    /(?:^|\/)(?:metabolic-)?logo\.png(?:\?|$)/i.test(src);

  // Drop invented external image URLs; keep logo, our assets, data URIs, ai-image placeholders.
  working = working.replace(IMG_TAG_RE, (tag) => {
    const src = getImgSrc(tag);
    if (!src) return '';
    if (isLogoSrc(src) || src.includes('/api/communication-assets/') || src.startsWith('data:image/')) {
      return tag;
    }
    if (parseAiImagePrompt(src)) return tag;
    return '';
  });

  // Normalize any logo variant to the canonical public URL and keep it small
  // (the brand mark is a pixel "M" — large sizes look soft/blocky in email).
  working = working.replace(
    /src=(["'])([^"']*(?:metabolic-)?logo\.png[^"']*)\1/gi,
    `src="${logoUrl}"`
  );
  working = working.replace(IMG_TAG_RE, (tag) => {
    const src = getImgSrc(tag);
    if (!src || !isLogoSrc(src)) return tag;
    let next = tag;
    if (/\bwidth\s*=/i.test(next)) {
      next = next.replace(/\bwidth\s*=\s*["']?[^"'>\s]+["']?/i, 'width="48"');
    } else {
      next = next.replace(/<img\b/i, '<img width="48"');
    }
    if (/\bheight\s*=/i.test(next)) {
      next = next.replace(/\bheight\s*=\s*["']?[^"'>\s]+["']?/i, 'height="42"');
    }
    if (/\bstyle\s*=\s*"/i.test(next)) {
      next = next.replace(
        /\bstyle\s*=\s*"([^"]*)"/i,
        (_m, style: string) =>
          `style="${style
            .replace(/width\s*:[^;]+;?/gi, '')
            .replace(/height\s*:[^;]+;?/gi, '')
            .replace(/max-width\s*:[^;]+;?/gi, '')
            .trim()}width:48px;height:auto;display:block;border:0;"`
      );
    } else {
      next = next.replace(
        /<img\b/i,
        '<img style="width:48px;height:auto;display:block;border:0;"'
      );
    }
    return next;
  });

  if (options.ensureDescription && !/src=["']ai-image:/i.test(working)) {
    const escaped = options.ensureDescription.replace(/"/g, '&quot;');
    const hero = `<img src="ai-image:${escaped}" alt="${escaped}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`;
    working = working.replace(/<\/?(?:body|table)[^>]*>/i, (m) => `${m}${hero}`) || `${hero}${working}`;
  }

  const tags = working.match(IMG_TAG_RE) || [];
  let generated = 0;
  for (const tag of tags) {
    const src = getImgSrc(tag);
    if (!src) continue;
    const description = parseAiImagePrompt(src);
    if (!description) continue;
    if (generated >= 2) {
      working = working.replace(tag, '');
      continue;
    }
    try {
      const url = await generateAndStoreEmailImage(description);
      working = working.replace(tag, replaceImgSrc(tag, url));
      generated += 1;
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'Image generation failed';
      working = working.replace(tag, '');
    }
  }

  return { html: working, imageError };
}

function buildSystemPrompt(category?: string): string {
  const logoUrl = getBrandLogoUrl();
  const variableDocs = COMMUNICATION_VARIABLES.map((v) => `- ${v.token} — ${v.description}`).join(
    '\n'
  );
  const categoryNote = category
    ? `Category: ${category}${
        categoryAllowsUnsubscribe(category)
          ? ' (optional / marketing — still do NOT put unsubscribe in the body)'
          : ' (required — do NOT mention unsubscribe)'
      }.`
    : 'Category is not selected yet — do NOT include unsubscribe content.';

  return `You design MARKETING / product emails for Metabolic OS (metabolic health, nutrition, coaching).
Return JSON only: {"subject":"...","html":"..."}.

Goal: polished SaaS marketing or onboarding emails — like a welcome campaign — NOT transactional alerts, system notices, or sparse "logo + paragraph" messages.

Tone: clear, encouraging, credible. Avoid hype, medical claims, or fear-mongering.
${categoryNote}
Do NOT include an unsubscribe link, {{unsubscribe_url}}, or "unsubscribe" footer — the send pipeline adds that when appropriate.

FORBIDDEN (alert-email patterns):
- Centered logo + one short paragraph + huge whitespace
- Plain notification copy with no sections
- Giant logo as the hero
- Light-gray tiny body text stretched full width without a card
- Missing CTA button

REQUIRED marketing shell:
1) Outer wrapper: full-width #e7ebef, centered inner table max-width 600px, white card, border-radius ~16px, overflow hidden.
2) Dark brand header band (#1b2733): "Metabolic OS" in white bold ~20px + short tagline in #9fb0c2 (~13px). Optional tiny logo (${logoUrl}) at most 28–36px wide in that band — never the visual hero. Prefer wordmark-first like a marketing header.
3) Hero block (white, padding ~38px 40px): bold headline 26–30px #1b2733 (may use {{recipient_name}}), then 15px supporting line #64748b.
4) Optional hero image AFTER the intro (rounded ~12px, border #e4e9ee) when a photo helps — use ai-image: (see Images). Place before benefit rows / CTA.
5) Benefit rows (3–5): each row = small colored number badge (44px rounded square) + bold title + 13px description. Vary soft badge washes (blue/pink/green/orange/gold). Not a plain bullet dump.
6) Primary CTA: centered pill button, #3b82f6 background (or #047857 if the brief is wellness-only), white bold 15px, generous padding, clear action label.
7) Footer strip: #f4f6f8, top border #e4e9ee, 11–12px #94a3b8 with {{organization}} · {{current_year}}.

Brand colors:
- Header: #1b2733 / tagline #9fb0c2
- Page wash: #e7ebef
- Card: #ffffff
- Headings: #1b2733
- Secondary body: #64748b
- Borders: #e4e9ee
- CTA: #3b82f6 preferred for product marketing

Images:
- ONE decorative image max when useful:
  <img src="ai-image:short description" alt="short description" width="518" style="display:block;width:100%;max-width:518px;height:auto;border:0;border-radius:12px;" />
- Do NOT invent external https image URLs.
- Do NOT enlarge the pixel logo.

HTML rules:
- Table-based, inline CSS, Arial/Helvetica.
- No <script>, <iframe>, or external stylesheets.
- Buttons: styled <a>, not <button>.
- Left-align headlines and body; center only the CTA (header may be left-aligned in the dark band).

Merge variables (ONLY these tokens):
${variableDocs}

Subject: concise, benefit-led, no spammy ALL CAPS.`;
}

export async function generateOrRefineEmail(
  input: AiEmailGenerateInput
): Promise<AiEmailGenerateResult> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = input.prompt.trim();
  const existingHtml = input.existingHtml?.trim() || '';
  const existingSubject = input.existingSubject?.trim() || '';

  if (!prompt && !existingHtml) {
    throw new Error('Provide a prompt or existing email to refine');
  }

  const isRefine = Boolean(existingHtml);
  const userParts: string[] = [];

  if (isRefine) {
    userParts.push(
      `Refine the current email based on this instruction:\n${prompt || 'Improve clarity and polish.'}`
    );
    if (existingSubject) userParts.push(`Current subject:\n${existingSubject}`);
    userParts.push(`Current HTML:\n${existingHtml}`);
    userParts.push('Return the full updated subject and html (not a partial patch).');
  } else {
    userParts.push(`Design a new email from this brief:\n${prompt}`);
  }

  if (input.category?.trim()) {
    userParts.push(`Category: ${input.category.trim()}`);
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: isRefine ? 0.5 : 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(input.category) },
        { role: 'user', content: userParts.join('\n\n') }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const completion = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = completion.choices?.[0]?.message?.content || '{}';
  let parsed: { subject?: unknown; html?: unknown };
  try {
    parsed = JSON.parse(raw) as { subject?: unknown; html?: unknown };
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
  const htmlRaw = typeof parsed.html === 'string' ? parsed.html.trim() : '';
  const ensureDescription = extractRequestedImageDescription(prompt);

  const resolved = await resolveAiEmailImages(htmlRaw, { ensureDescription });
  const html = sanitizeCommunicationHtml(stripUnsubscribeMarkup(resolved.html));

  if (!html) {
    throw new Error('AI did not return email HTML');
  }

  return {
    subject: subject || existingSubject || 'Untitled',
    html,
    imageError: resolved.imageError
  };
}
