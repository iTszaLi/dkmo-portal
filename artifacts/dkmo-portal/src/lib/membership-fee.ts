export const DEFAULT_MEMBERSHIP_FEE = 100;

/**
 * Membership-fee amounts are preserved when a configured/imported amount is
 * present. Some current members have a legacy zero placeholder, so use the
 * configured one-time fee for every real fee status instead of displaying a
 * false SAR 0.00 amount.
 */
export function getMembershipFeeAmount(value: number | null | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_MEMBERSHIP_FEE;
}