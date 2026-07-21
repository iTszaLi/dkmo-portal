import { UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { wrap: "h-8 w-8", icon: "h-4 w-4" },
  md: { wrap: "h-10 w-10", icon: "h-5 w-5" },
  lg: { wrap: "h-11 w-11", icon: "h-6 w-6" },
  xl: { wrap: "h-20 w-20", icon: "h-11 w-11" },
} as const;

export type MemberAvatarSize = keyof typeof SIZE_STYLES;

export function MemberAvatar({
  photoUrl,
  name,
  size = "md",
  className,
}: {
  photoUrl?: string | null;
  name: string;
  size?: MemberAvatarSize;
  className?: string;
}) {
  const s = SIZE_STYLES[size];
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${name} photo`}
        className={cn(
          s.wrap,
          "rounded-full object-cover border border-emerald-200 dark:border-slate-700 shrink-0",
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        s.wrap,
        "flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0",
        className,
      )}
    >
      <UserCircle className={s.icon} />
    </div>
  );
}
