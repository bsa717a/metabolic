export function normalizePhone(from: string) {
  let phone = from.replace(/^whatsapp:/i, '').trim();
  if (!phone) return phone;

  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;

  // US national numbers (10 digits) — e.g. 5103759360 or +5103759360 (missing country code 1).
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // US numbers with country code — e.g. 19044030781 or +1 (510) 375-9360.
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // US numbers stored with an extra trailing digit (80135818559 -> 8013581855).
  // Skip when the value already has a + prefix — those are more likely international E.164.
  if (digits.length === 11 && !digits.startsWith('1') && !phone.startsWith('+')) {
    const firstTen = digits.slice(0, 10);
    if (/^[2-9]\d{9}$/.test(firstTen)) {
      return `+1${firstTen}`;
    }
  }

  // Other E.164 values that already include a country code.
  if (phone.startsWith('+') || digits.length > 11) {
    return `+${digits}`;
  }

  return `+${digits}`;
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
