import { Link } from "wouter";
import { useGetDashboardAlerts, getGetDashboardAlertsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, XCircle, Info, CheckCircle2, ArrowRight, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/navigation";

const SEVERITY = {
  critical: { icon: XCircle, row: "border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20", iconCls: "text-red-500" },
  warning: { icon: AlertTriangle, row: "border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20", iconCls: "text-orange-500" },
  info: { icon: Info, row: "border-green-200 dark:border-green-900/50 bg-green-50/40 dark:bg-green-950/20", iconCls: "text-green-600" },
} as const;

/** Compact, actionable dashboard queue driven by the dashboard alerts endpoint. */
export function ActionRequired() {
  const { data: alerts, isLoading, isError, refetch } = useGetDashboardAlerts({
    query: { refetchInterval: 60_000, queryKey: getGetDashboardAlertsQueryKey() },
  });
  const items = (alerts ?? [])
    .filter((alert) => alert.severity !== "info")
    .slice(0, 6);

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-green-600" /> Attention Required
        </CardTitle>
        <CardDescription className="dark:text-slate-400">Only items that need admin or committee action</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-orange-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
               Unable to load attention items
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-xs font-semibold text-green-700 underline-offset-2 hover:underline dark:text-green-400"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-green-800/60 dark:text-slate-500">
            <CheckCircle2 className="h-8 w-8 text-green-300 dark:text-green-800" />
            <p className="text-sm font-medium">Everything is up to date</p>
            <p className="text-xs">No immediate action is required.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => {
              const sev = SEVERITY[a.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
              const Icon = sev.icon;
              const content = (
                <>
                  <Icon className={cn("h-4 w-4 shrink-0", sev.iconCls)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{a.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.description}</p>
                  </div>
                   {a.count > 0 ? (
                     <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                       {a.count}
                     </span>
                   ) : null}
                  {a.link ? (
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-green-500 transition-transform shrink-0" />
                  ) : null}
                </>
              );
              const rowClass = cn(
                "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                sev.row,
                a.link && "group hover:brightness-[0.98] dark:hover:brightness-110",
              );
              return a.link ? (
                <Link key={a.id} href={withReturnTo(a.link)} className={rowClass}>
                  {content}
                </Link>
              ) : (
                <div key={a.id} className={rowClass}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
