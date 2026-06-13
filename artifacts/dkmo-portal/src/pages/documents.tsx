import { useState } from "react";
import { useListReceiptRecords, useDeleteReceiptRecord } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FolderOpen,
  Receipt,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatSAR(n: number) {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(n);
}

function parsePaymentTypes(json: string): string {
  try {
    const obj = JSON.parse(json);
    const labels: string[] = [];
    if (obj.lifeMembership) labels.push("Life Membership");
    if (obj.voluntaryYearly) labels.push("Voluntary Yearly");
    if (obj.donation) labels.push("Donation");
    if (obj.loanRecovery) labels.push("Loan Recovery");
    if (obj.others) labels.push("Others");
    if (obj.frfCase) labels.push(`FRF #${obj.frfCase}`);
    return labels.join(", ") || "—";
  } catch {
    return "—";
  }
}

export default function DocumentsPage() {
  const { canDelete } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");

  const { data, isLoading, refetch } = useListReceiptRecords({
    search: search || undefined,
    page,
    pageSize,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const deleteMutation = useDeleteReceiptRecord({
    mutation: {
      onSuccess: () => {
        toast({ title: "Receipt record deleted" });
        refetch();
        setDeletingId(null);
      },
      onError: (err) => {
        toast({ title: "Could not delete", description: String(err), variant: "destructive" });
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100 flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-green-700 dark:text-green-400" />
            Documents
          </h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-0.5">
            Saved receipt records generated from the Receipt Generator.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="border-green-300 dark:border-slate-700 text-green-800 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Receipts Card */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Receipt Records
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                {isLoading ? "Loading…" : `${total} saved receipt${total !== 1 ? "s" : ""}`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-green-700/50 dark:text-slate-500" />
              <Input
                placeholder="Search by name, receipt #…"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                className="pl-8 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-green-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-400">Receipt #</TableHead>
                  <TableHead className="dark:text-slate-400">Date</TableHead>
                  <TableHead className="dark:text-slate-400">Member</TableHead>
                  <TableHead className="dark:text-slate-400">DKMO ID</TableHead>
                  <TableHead className="dark:text-slate-400">Jamath</TableHead>
                  <TableHead className="dark:text-slate-400">Purpose</TableHead>
                  <TableHead className="text-right dark:text-slate-400">Amount</TableHead>
                  <TableHead className="dark:text-slate-400">Saved On</TableHead>
                  {canDelete && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canDelete ? 9 : 8}
                      className="h-32 text-center text-green-700/60 dark:text-slate-500"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-green-200 dark:text-slate-700" />
                        <p>No receipt records saved yet.</p>
                        <p className="text-xs">
                          Generate a receipt on the{" "}
                          <a href="/receipts" className="underline text-green-700 dark:text-green-400">
                            Receipts
                          </a>{" "}
                          page and save it to see it here.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((r) => (
                    <TableRow
                      key={r.id}
                      className="hover:bg-green-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors"
                    >
                      <TableCell>
                        <Badge className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700">
                          {r.receiptNumber}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-800 dark:text-slate-300 whitespace-nowrap">
                        {r.receiptDate}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-green-950 dark:text-slate-100 text-sm">
                          {r.memberName}
                        </div>
                        {r.mobileNumber && (
                          <div className="text-xs text-green-700/60 dark:text-slate-500">
                            {r.mobileNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-green-800 dark:text-slate-300 font-mono">
                        {r.dkmoId || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-green-800/80 dark:text-slate-400">
                        {r.jamathName || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-green-700 dark:text-slate-400 max-w-[160px] truncate">
                        {parsePaymentTypes(r.paymentTypes ?? "{}")}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-900 dark:text-green-300 whitespace-nowrap">
                        {formatSAR(r.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-green-700/70 dark:text-slate-500 whitespace-nowrap">
                        {formatDate(r.createdAt)}
                      </TableCell>
                      {canDelete && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => {
                              setDeletingId(r.id);
                              setDeletingName(r.receiptNumber);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-green-50 dark:border-slate-800 text-sm text-green-800 dark:text-slate-400">
              <div>Page {page} of {totalPages} · {total} records</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Delete receipt record?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This will remove the saved record for receipt <strong>{deletingName}</strong>. The
              original PDF is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700 dark:text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deletingId && deleteMutation.mutate({ id: deletingId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
