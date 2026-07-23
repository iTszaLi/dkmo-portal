import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowRight } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AuditItem = {
  id: string;
  userName: string;
  action: string;
  module: string;
  entityName: string | null;
  createdAt: string;
};

const MODULE_DOT: Record<string, string> = {
  members: "bg-green-500",
  payments: "bg-blue-500",
  frf: "bg-rose-500",
  loans: "bg-indigo-500",
  sponsors: "bg-teal-500",
  events: "bg-purple-500",
  documents: "bg-slate-400",
};

function actionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Recent portal activity from the audit log (visible to admin/finance only). */
export function ActivityFeed() {
  const { data, isLoading } = useQuery<{ items: AuditItem[] }>({
    queryKey: ["audit-logs", "activity-feed"],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/audit-logs?page=1&pageSize=12`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-600" /> Recent Activity
          </CardTitle>
          <CardDescription className="dark:text-slate-400">Latest actions across the portal</CardDescription>
        </div>
        <Link href="/audit" className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">No recent activity.</p>
        ) : (
          <div className="space-y-0.5">
            {items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-green-50/50 dark:hover:bg-slate-800/60 transition-colors">
                <span className={`h-2 w-2 rounded-full shrink-0 ${MODULE_DOT[a.module] ?? "bg-slate-300"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
                    <span className="font-semibold">{a.userName}</span>{" "}
                    <span className="text-slate-600 dark:text-slate-400">{actionLabel(a.action).toLowerCase()}</span>
                    {a.entityName ? <span className="font-medium"> · {a.entityName}</span> : null}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
