/**
 * WhatsApp number + link helpers.
 *
 * Members' numbers are stored in local formats (e.g. "0502260270" for KSA).
 * wa.me requires full international format WITHOUT "+" or leading zeros,
 * so "0502260270" must become "966502260270" or WhatsApp rejects the link.
 */

/** Normalize a raw mobile number to international digits for wa.me, or null if unusable. */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // "00966..." → "966..."
  if (digits.startsWith("00")) digits = digits.replace(/^00+/, "");

  // Already has a country code we recognize (KSA 966 / India 91) and a sane length.
  if (digits.startsWith("966") && digits.length === 12) return digits;
  if (digits.startsWith("91") && digits.length === 12) return digits;

  // KSA local formats: "05XXXXXXXX" (10) or "5XXXXXXXX" (9) → prefix 966.
  if (digits.length === 10 && digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `966${digits}`;

  // Indian local format: 10 digits starting 6-9 → prefix 91.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;

  // Fallback: strip leading zeros; require a plausible international length.
  digits = digits.replace(/^0+/, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Build a wa.me chat link with a prefilled message. */
export function buildWhatsAppLink(normalizedNumber: string, message: string): string {
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`;
}

export interface WhatsAppTarget {
  id: string;
  name: string;
  /** Normalized international number (from normalizeWhatsAppNumber). */
  number: string;
  message: string;
}
