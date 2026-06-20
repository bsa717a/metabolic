export function normalizePhone(from: string) {
  let phone = from.replace(/^whatsapp:/i, '').trim();
  if (phone && !phone.startsWith('+')) {
    phone = `+${phone}`;
  }
  return phone;
}

export function phoneDigits(phone: string) {
  return normalizePhone(phone).replace(/\D/g, '');
}

/** True when two stored/inbound numbers are the same line (US: last 10 digits). */
export function phonesMatch(stored: string | null | undefined, incoming: string) {
  if (!stored?.trim()) return false;
  const a = phoneDigits(stored);
  const b = phoneDigits(incoming);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 10 && b.length >= 10) {
    return a.slice(-10) === b.slice(-10);
  }
  return false;
}
