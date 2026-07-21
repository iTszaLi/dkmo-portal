import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListTasks, useDeleteTask, useUpdateTask } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ListChecks,
  ArrowRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  CalendarDays,
  Handshake,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
  high:   "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  medium: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  low:    "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
};

const STATUS_STYLE: Record<string, string> = {
  pending:     "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  in_progress: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  completed:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  cancelled:   "bg-slate-100 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-500",
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
};

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Tasks() {
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("priority");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryParams = useMemo(
    () => ({
      ...(statusFilter === "active"
        ? {}
        : statusFilter !== "all"
          ? { status: statusFilter as (typeof TASK_STATUSES)[number] }
          : {}),
      ...(priorityFilter !== "all"
        ? { priority: priorityFilter as (typeof PRIORITIES)[number] }
        : {}),
      sort: sort as "recent" | "dueAsc" | "dueDesc" | "priority",
      page,
      pageSize,
    }),
    [statusFilter, priorityFilter, sort, page],
  );

  const { data, isLoading, refetch } = useListTasks(queryParams);
  const allItems = data?.items ?? [];

  // Client-side filter for "active" (pending + in_progress) + text search
  const items = useMemo(() => {
    let list = allItems;
    if (statusFilter === "active") {
      list = list.filter((t) => t.status === "pending" || t.status === "in_progress");
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.assignedTo?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allItems, statusFilter, searchText]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const deleteMutation = useDeleteTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Task deleted" });
        refetch();
      },
      onError: (err) =>
        toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        refetch();
      },
      onError: (err) =>
        toast({ title: "Could not update", description: String(err), variant: "destructive" }),
    },
  });

  const cycleStatus = (id: string, current: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const next: Record<string, string> = {
      pending: "in_progress",
      in_progress: "completed",
      completed: "pending",
      cancelled: "pending",
    };
    updateMutation.mutate({ id, data: { title, status: next[current] as "pending" | "in_progress" | "completed" | "cancelled" } });
  };

  const onDelete = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete task "${title}"?`)) return;
    deleteMutation.mutate({ id });
  };

  const urgentCount = items.filter((t) => t.priority === "urgent" && t.status !== "completed" && t.status !== "cancelled").length;
  const overdueCount = items.filter((t) => isOverdue(t.dueDate) && t.status !== "completed" && t.status !== "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">Tasks &amp; Follow-ups</h1>
          <p className="text-sm text-green-800/70 dark:text-green-300/70">
            Assign and track sponsor follow-up tasks across the team.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setLocation("/tasks/new")}
            className="bg-green-700 hover:bg-green-800 text-white"
            data-testid="button-add-task"
          >
            <Plus className="h-4 w-4 mr-1" /> New Task
          </Button>
        )}
      </div>

      {/* Alert row */}
      {(urgentCount > 0 || overdueCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-2 text-sm font-medium dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              <XCircle className="h-4 w-4 shrink-0" />
              {overdueCount} overdue task{overdueCount === 1 ? "" : "s"}
            </div>
          )}
          {urgentCount > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-4 py-2 text-sm font-medium dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300">
              <Clock className="h-4 w-4 shrink-0" />
              {urgentCount} urgent task{urgentCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}

      <Card className="rounded-2xl border-green-100 dark:border-slate-700 shadow-sm dark:bg-slate-900">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">All tasks</CardTitle>
              <CardDescription>
                {isLoading ? "Loading…" : `${items.length} shown`}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
                <Input
                  placeholder="Search task or assignee…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v) => { setPage(1); setPriorityFilter(v); }}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="dueAsc">Due (earliest)</SelectItem>
                  <SelectItem value="dueDesc">Due (latest)</SelectItem>
                  <SelectItem value="recent">Recently added</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-green-800/60 dark:text-green-300/60">
              <ListChecks className="h-10 w-10 text-green-200 dark:text-green-700" />
              <p className="text-sm">No tasks found.</p>
              {canEdit && (
                <Button
                  onClick={() => setLocation("/tasks/new")}
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-800 dark:border-green-700 dark:text-green-300"
                >
                  <Plus className="h-4 w-4 mr-1" /> Create first task
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-green-50 dark:divide-slate-800">
              {items.map((t) => {
                const StatusIcon = STATUS_ICON[t.status] ?? Circle;
                const overdue = isOverdue(t.dueDate) && t.status !== "completed" && t.status !== "cancelled";
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 py-3 cursor-pointer hover:bg-green-50/40 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors group"
                    onClick={() => setLocation(`/tasks/${t.id}`)}
                  >
                    {/* Status toggle */}
                    <button
                      className={cn(
                        "mt-0.5 shrink-0 transition-colors",
                        t.status === "completed"
                          ? "text-green-600 dark:text-green-400"
                          : t.status === "cancelled"
                            ? "text-slate-400 dark:text-slate-500"
                            : "text-green-700/40 hover:text-green-700 dark:text-green-500/40 dark:hover:text-green-400",
                      )}
                      onClick={(e) => cycleStatus(t.id, t.status, t.title, e)}
                      title="Click to cycle status"
                    >
                      <StatusIcon className="h-5 w-5" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn(
                          "text-sm font-medium text-green-950 dark:text-slate-100",
                          t.status === "completed" && "line-through text-green-700/50 dark:text-slate-500",
                        )}>
                          {t.title}
                        </p>
                        <Badge className={cn("shrink-0", PRIORITY_STYLE[t.priority] ?? "")}>{t.priority}</Badge>
                        <Badge className={cn("shrink-0", STATUS_STYLE[t.status] ?? "")}>{t.status.replace("_", " ")}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-green-700/60 dark:text-slate-400 flex-wrap">
                        {t.assignedTo && <span>→ {t.assignedTo}</span>}
                        {t.dueDate && (
                          <span className={cn("flex items-center gap-1", overdue && "text-red-600 dark:text-red-400 font-medium")}>
                            <CalendarDays className="h-3 w-3" />
                            {overdue ? "Overdue: " : ""}{formatDate(t.dueDate)}
                          </span>
                        )}
                        {t.sponsorName && (
                          <span className="flex items-center gap-1">
                            <Handshake className="h-3 w-3" />
                            {t.sponsorName}
                          </span>
                        )}
                        {t.eventName && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {t.eventName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/tasks/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700 dark:text-green-400">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                          onClick={(e) => onDelete(t.id, t.title, e)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-green-50 dark:border-slate-700 mt-3">
              <p className="text-sm text-green-700/70 dark:text-slate-400">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8 border-green-200 dark:border-slate-600" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8 border-green-200 dark:border-slate-600" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
