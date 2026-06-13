import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListSponsors,
  useDeleteSponsor,
} from "@workspace/api-client-react";
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
  Handshake,
  ArrowRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;
const STATUSES = ["pending", "partial", "paid", "overdue"] as const;

const TIER_STYLE: Record<string, string> = {
  platinum: "bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-200 ring-1 ring-violet-300 dark:ring-violet-700/50",
  gold: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-300 ring-1 ring-yellow-300 dark:ring-yellow-700/50",
  silver: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 ring-1 ring-sky-300 dark:ring-sky-700/50",
  bronze: "bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700/50",
};
const STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700/50",
  partial: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700/50",
  pending: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700/50",
  overdue: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700/50",
};

function formatSAR(n: number) {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function Sponsors() {
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("recent");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(tier !== "all" ? { tier: tier as (typeof TIERS)[number] } : {}),
      ...(status !== "all" ? { status: status as (typeof STATUSES)[number] } : {}),
      sort: sort as "recent" | "name" | "totalDesc" | "totalAsc" | "pendingDesc",
      page,
      pageSize,
    }),
    [search, tier, status, sort, page],
  );

  const { data, isLoading, refetch } = useListSponsors(queryParams);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const deleteMutation = useDeleteSponsor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sponsor deleted" });
        refetch();
      },
      onError: (err) => {
        toast({
          title: "Could not delete",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      },
    },
  });

  const onDelete = (id: string, name: string) => {
    if (!confirm(`Delete sponsor "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">Sponsors</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400">
            Manage sponsorship pipeline, tiers and assigned staff.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setLocation("/sponsors/new")}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
            data-testid="button-add-sponsor"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Sponsor
          </Button>
        )}
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">All sponsors</CardTitle>
              <CardDescription className="dark:text-slate-400">
                {isLoading ? "Loading…" : `${total} total`}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:w-auto">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-green-700/50 dark:text-slate-500" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                  className="pl-8 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                  data-testid="input-sponsor-search"
                />
              </div>
              <Select value={tier} onValueChange={(v) => { setPage(1); setTier(v); }}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" data-testid="select-tier">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All tiers</SelectItem>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v); }}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" data-testid="select-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" data-testid="select-sort">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="recent" className="dark:text-slate-300 dark:focus:bg-slate-800">Most recent</SelectItem>
                  <SelectItem value="name" className="dark:text-slate-300 dark:focus:bg-slate-800">Name (A→Z)</SelectItem>
                  <SelectItem value="totalDesc" className="dark:text-slate-300 dark:focus:bg-slate-800">Total (high→low)</SelectItem>
                  <SelectItem value="totalAsc" className="dark:text-slate-300 dark:focus:bg-slate-800">Total (low→high)</SelectItem>
                  <SelectItem value="pendingDesc" className="dark:text-slate-300 dark:focus:bg-slate-800">Pending (high→low)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-green-700/70 dark:text-slate-500">
              <Handshake className="h-10 w-10 mx-auto mb-2 text-green-700/40 dark:text-slate-700" />
              No sponsors yet.
              {canEdit && (
                <div className="mt-3">
                  <Button
                    onClick={() => setLocation("/sponsors/new")}
                    variant="outline"
                    className="border-green-300 dark:border-slate-700 text-green-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add your first sponsor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-slate-800">
                    <TableHead className="dark:text-slate-400">Sponsor</TableHead>
                    <TableHead className="dark:text-slate-400">Tier</TableHead>
                    <TableHead className="dark:text-slate-400">Status</TableHead>
                    <TableHead className="text-right dark:text-slate-400">Total</TableHead>
                    <TableHead className="text-right dark:text-slate-400">Paid</TableHead>
                    <TableHead className="text-right dark:text-slate-400">Pending</TableHead>
                    <TableHead className="dark:text-slate-400">Event</TableHead>
                    <TableHead className="dark:text-slate-400">Staff</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow
                      key={s.id}
                      className="hover:bg-green-50/40 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors"
                      data-testid={`row-sponsor-${s.id}`}
                    >
                      <TableCell>
                        <Link
                          href={`/sponsors/${s.id}`}
                          className="font-medium text-green-950 dark:text-slate-200 hover:text-green-700 dark:hover:text-green-300 hover:underline"
                        >
                          {s.sponsorName}
                        </Link>
                        <div className="text-xs text-green-700/70 dark:text-slate-500">
                          {s.company || s.contactPerson || s.email || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("capitalize text-[11px]", TIER_STYLE[s.tier] ?? "")}>
                          {s.tier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("capitalize text-[11px]", STATUS_STYLE[s.status] ?? "")}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-900 dark:text-slate-200">
                        {formatSAR(s.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right text-green-800 dark:text-green-400">
                        {formatSAR(s.paidAmount)}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", s.pendingAmount > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400")}>
                        {formatSAR(s.pendingAmount)}
                      </TableCell>
                      <TableCell className="text-xs text-green-800/80 dark:text-slate-400">
                        {s.linkedEvent || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-green-800/80 dark:text-slate-400">
                        {s.assignedStaff || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/sponsors/${s.id}`}>
                            <Button variant="ghost" size="sm" className="text-green-800 dark:text-slate-300 hover:text-green-900 dark:hover:text-slate-100 hover:bg-green-50 dark:hover:bg-slate-800">
                              View <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </Link>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => onDelete(s.id, s.sponsorName)}
                              data-testid={`button-delete-${s.id}`}
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-green-800 dark:text-slate-400">
                  <div>Page {page} of {totalPages} · {total} sponsors</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
