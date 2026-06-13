import { useState } from "react";
import { Link } from "wouter";
import { useGetDashboardAlerts } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, XCircle, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE = {
  critical: {
    dot: "bg-red-500",
    icon: XCircle,
    iconClass: "text-red-500",
    rowClass: "border-l-2 border-red-400 bg-red-50/60",
    badge: "bg-red-500",
  },
  warning: {
    dot: "bg-orange-400",
    icon: AlertTriangle,
    iconClass: "text-orange-500",
    rowClass: "border-l-2 border-orange-300 bg-orange-50/60",
    badge: "bg-orange-400",
  },
  info: {
    dot: "bg-green-500",
    icon: CheckCircle2,
    iconClass: "text-green-600",
    rowClass: "border-l-2 border-green-300 bg-green-50/40",
    badge: "bg-green-500",
  },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: alerts = [], refetch } = useGetDashboardAlerts({
    query: { refetchInterval: 60_000 },
  });

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const badgeCount = criticalCount + warningCount;

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (v) refetch(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full hover:bg-green-50 transition-all duration-200"
          aria-label="Notifications"
          data-testid="button-notifications"
        >
          <Bell className={cn("h-5 w-5", badgeCount > 0 ? "text-green-800" : "text-green-700/60")} />
          {badgeCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold text-white px-1",
                criticalCount > 0 ? "bg-red-500" : "bg-orange-400",
              )}
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        <DropdownMenuLabel className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-green-950">Notifications</span>
          <div className="flex items-center gap-1.5 text-xs text-green-700/70">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-orange-600 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />
                {warningCount} warning
              </span>
            )}
            {badgeCount === 0 && (
              <span className="text-green-600 font-medium">All clear</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        <ScrollArea className="max-h-[420px]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-green-800/50">
              <CheckCircle2 className="h-8 w-8 text-green-300" />
              <p className="text-sm font-medium">No alerts at this time</p>
            </div>
          ) : (
            <div className="py-1">
              {alerts.map((alert) => {
                const style = SEVERITY_STYLE[alert.severity];
                const Icon = style.icon;
                return (
                  <Link
                    key={alert.id}
                    href={alert.link}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 mx-1 my-0.5 rounded-lg cursor-pointer hover:opacity-90 transition-opacity",
                      style.rowClass,
                    )}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", style.iconClass)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-green-950 leading-snug">{alert.title}</p>
                      <p className="text-xs text-green-800/70 mt-0.5 leading-snug">{alert.description}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-700/40" />
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {alerts.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="px-4 py-2.5">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 text-xs font-medium text-green-800 hover:text-green-900"
              >
                View dashboard <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
