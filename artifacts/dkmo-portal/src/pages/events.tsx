import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListEvents, useDeleteEvent } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  CalendarDays,
  ArrowRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const EVENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;

const STATUS_STYLE: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  ongoing:  "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  completed:"bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
  cancelled:"bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
};

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatSAR(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function Events() {
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("dateDesc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(status !== "all" ? { status: status as (typeof EVENT_STATUSES)[number] } : {}),
      sort: sort as "recent" | "name" | "dateAsc" | "dateDesc",
      page,
      pageSize,
    }),
    [search, status, sort, page],
  );

  const { data, isLoading, refetch } = useListEvents(queryParams);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const deleteMutation = useDeleteEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Event deleted" });
        refetch();
      },
      onError: (err) => {
        toast({
          title: "Could not delete",
          description: String(err),
          variant: "destructive",
        });
      },
    },
  });

  const onDelete = (id: string, name: string) => {
    if (!confirm(`Delete event "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">Events</h1>
          <p className="text-sm text-green-800/70 dark:text-green-300/70">
            Plan events, link sponsors and tasks, track budgets.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setLocation("/events/new")}
            className="bg-green-700 hover:bg-green-800 text-white"
            data-testid="button-add-event"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        )}
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-700 shadow-sm dark:bg-slate-900">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">All events</CardTitle>
              <CardDescription>{isLoading ? "Loading…" : `${total} total`}</CardDescription>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:w-auto">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-green-700/50 dark:text-green-400/50" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                  className="pl-8"
                />
              </div>
              <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v); }}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {EVENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dateDesc">Date (newest)</SelectItem>
                  <SelectItem value="dateAsc">Date (oldest)</SelectItem>
                  <SelectItem value="name">Name (A→Z)</SelectItem>
                  <SelectItem value="recent">Recently added</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-green-800/60 dark:text-green-300/60">
              <CalendarDays className="h-10 w-10 text-green-200 dark:text-green-700" />
              <p className="text-sm">No events found.</p>
              {canEdit && (
                <Button
                  onClick={() => setLocation("/events/new")}
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-800 dark:border-green-700 dark:text-green-300"
                >
                  <Plus className="h-4 w-4 mr-1" /> Create your first event
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-green-50/50 hover:bg-green-50/50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50">
                  <TableHead className="font-semibold text-green-900 dark:text-green-300">Event</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-green-300">Date</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-green-300 hidden md:table-cell">Location</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-green-300 hidden lg:table-cell">Budget</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-green-300">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ev) => (
                  <TableRow
                    key={ev.id}
                    className="cursor-pointer hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors"
                    onClick={() => setLocation(`/events/${ev.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-green-50 border border-green-100 dark:bg-green-900/30 dark:border-green-800">
                          <CalendarDays className="h-4 w-4 text-green-700 dark:text-green-400" />
                        </div>
                        <p className="text-sm font-semibold text-green-950 dark:text-slate-100">{ev.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-green-900 dark:text-slate-300">{formatDate(ev.eventDate)}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-green-800/70 dark:text-slate-400">
                      {ev.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {ev.location}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-green-900 dark:text-slate-300">
                      {formatSAR(ev.budget)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize", STATUS_STYLE[ev.status] ?? "")}>
                        {ev.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/events/${ev.id}`}>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-800 dark:text-green-400">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30"
                            onClick={() => onDelete(ev.id, ev.name)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-green-50 dark:border-slate-700 mt-3">
              <p className="text-sm text-green-700/70 dark:text-slate-400">
                Page {page} of {totalPages} · {total} event{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-green-200 dark:border-slate-600"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-green-200 dark:border-slate-600"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
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
