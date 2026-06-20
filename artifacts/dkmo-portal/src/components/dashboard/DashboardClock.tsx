import { useEffect, useState } from "react";
import { Clock, Moon } from "lucide-react";
import { getHijriDate } from "@/lib/hijri";

export function DashboardClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const gregorian = now.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hijri = getHijriDate(now);

  return (
    <div
      className="glass rounded-2xl border border-green-100/70 dark:border-slate-700/60 px-4 py-3 shadow-sm"
      data-testid="widget-clock"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 text-white shadow-sm">
          <Clock className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tabular-nums leading-none text-green-950 dark:text-green-100">
            {time}
          </p>
          <p className="mt-1 text-xs text-green-800/70 dark:text-slate-400 truncate">{gregorian}</p>
        </div>
      </div>
      {hijri && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-green-100/70 dark:border-slate-700/60 pt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <Moon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{hijri}</span>
        </div>
      )}
    </div>
  );
}
