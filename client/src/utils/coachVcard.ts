import type { VirtualCoach } from '../data/virtualCoaches';

/** Escape a value for a vCard text field (RFC 6350). */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Fold a long vCard content line per RFC 2426: physical lines are limited to
 * 75 octets, with continuation lines starting with a single space. Needed so
 * the long base64 PHOTO line is parsed correctly by contact apps.
 */
function foldVCardLine(line: string): string {
  const chunks: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    chunks.push(` ${line.slice(i, i + 74)}`);
  }
  return chunks.join('\r\n');
}

/**
 * Load the coach poster and crop it to a square headshot (matching the avatar
 * crop used in the UI), returned as base64 JPEG for embedding in the vCard.
 * Resolves to null if the image cannot be loaded/processed.
 */
async function loadCoachPhotoBase64(imageUrl: string): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image load failed'));
      image.src = imageUrl;
    });

    const size = 480;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Replicate object-cover with objectPosition 50% 18%: crop the largest
    // square anchored horizontally centered and biased toward the top (face).
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) * 0.5;
    const sy = (img.naturalHeight - side) * 0.18;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1] ?? '';
    return base64 || null;
  } catch {
    return null;
  }
}

/** Build a vCard 3.0 string for a virtual coach contact, embedding the photo when possible. */
export async function buildCoachVCard(coach: VirtualCoach): Promise<string> {
  const fullName = `${coach.name} (Virtual Coach)`;
  const note = `${coach.tagline}\n\n${coach.bio}`;

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:Virtual Coach;${escapeVCardValue(coach.name)};;;`,
    `FN:${escapeVCardValue(fullName)}`,
    'ORG:Master Metabolic',
    `TITLE:${escapeVCardValue(coach.role)}`,
    `TEL;TYPE=CELL:${coach.phone}`,
    `NOTE:${escapeVCardValue(note)}`
  ];

  const photoBase64 = await loadCoachPhotoBase64(coach.image);
  if (photoBase64) {
    lines.push(foldVCardLine(`PHOTO;ENCODING=b;TYPE=JPEG:${photoBase64}`));
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** Generate and trigger a download of the coach's contact card (.vcf). */
export async function downloadCoachContact(coach: VirtualCoach): Promise<void> {
  const vcard = await buildCoachVCard(coach);
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${coach.name}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
