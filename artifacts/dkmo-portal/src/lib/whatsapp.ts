import { formatSAR } from "@/lib/utils";

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

export const FRF_UNPAID_STATUSES = new Set(["pending", "partial", "overdue"]);

export interface FrfReminderContributor {
  fullName: string;
  amount: number;
  balance: number;
  membershipId: string;
}

export function canSendFrfReminder(
  activeCaseStatus: string | undefined,
  contributionStatus: string,
): boolean {
  return activeCaseStatus === "approved" && FRF_UNPAID_STATUSES.has(contributionStatus);
}

export function buildFrfReminderMessage(
  contributor: FrfReminderContributor,
  activeCaseTitle: string,
): string {
  return `Assalamu Alaikum ${contributor.fullName},

This is a reminder from DKMO regarding your FRF (Family Relief Fund) contribution.

FRF Case: ${activeCaseTitle}
FRF Fee: ${formatSAR(contributor.amount)}
Amount Due: ${formatSAR(contributor.balance)}
DKMO ID: ${contributor.membershipId}

Our records show that your FRF contribution for this case is still unpaid.

Kindly arrange the payment at your earliest convenience.

JazakAllahu Khairan,
DKMO`;
}

export interface WhatsAppTarget {
  id: string;
  name: string;
  /** Normalized international number (from normalizeWhatsAppNumber). */
  number: string;
  message: string;
}
