import {
  Banknote,
  Smartphone,
  Landmark,
  CreditCard,
  ScrollText,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  cash: Banknote,
  upi: Smartphone,
  bank_transfer: Landmark,
  card: CreditCard,
  cheque: ScrollText,
  other: Wallet,
};

export function getPaymentIcon(method: string | null | undefined): LucideIcon {
  if (!method) return Wallet;
  return ICON_MAP[method.toLowerCase()] ?? Wallet;
}

export function PaymentMethodIcon({
  method,
  className,
}: {
  method: string | null | undefined;
  className?: string;
}) {
  const Icon = getPaymentIcon(method);
  return <Icon className={className} />;
}
