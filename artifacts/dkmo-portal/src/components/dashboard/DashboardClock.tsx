import { CalendarDays } from "lucide-react";

export function DashboardClock() {
  const now = new Date();
  const gregorian = now.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="glass rounded-2xl border border-green-100/70 dark:border-slate-700/60 px-4 py-3 shadow-sm"
      data-testid="widget-clock"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 text-white shadow-sm">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight text-green-950 dark:text-green-100">
            {gregorian}
          </p>
        </div>
      </div>
    </div>
  );
}
