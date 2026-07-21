import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSAR(amount: number | undefined | null): string {
  if (amount == null) return "SAR 0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), "dd MMM yyyy");
  } catch {
    return dateString;
  }
}

export function formatYearMonth(yyyymm: string | undefined | null): string {
  if (!yyyymm) return "";
  try {
    const [y, m] = yyyymm.split("-");
    if (!y || !m) return yyyymm;
    return format(new Date(Number(y), Number(m) - 1, 1), "MMM yyyy");
  } catch {
    return yyyymm;
  }
}

export function getCurrentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

export function getCurrentYear(): string {
  return format(new Date(), "yyyy");
}

export function feeStatusLabel(status: string | undefined | null): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    default:
      return "Unpaid";
  }
}

export function feeStatusBadgeClass(status: string | undefined | null): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
}
