import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  useGetSponsor,
  useCreateSponsor,
  useUpdateSponsor,
  useDeleteSponsor,
  getGetSponsorQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;
const STATUSES = ["pending", "partial", "paid", "overdue"] as const;
type Tier = (typeof TIERS)[number];
type Status = (typeof STATUSES)[number];

interface FormState {
  sponsorName: string;
  company: string;
  contactPerson: string;
  phone: string;
  email: string;
  tier: Tier;
  totalAmount: string;
  paidAmount: string;
  status: Status;
  assignedStaff: string;
  linkedEvent: string;
  dueDate: string; // YYYY-MM-DD
  notes: string;
}

const EMPTY: FormState = {
  sponsorName: "",
  company: "",
  contactPerson: "",
  phone: "",
  email: "",
  tier: "bronze",
  totalAmount: "0",
  paidAmount: "0",
  status: "pending",
  assignedStaff: "",
  linkedEvent: "",
  dueDate: "",
  notes: "",
};

function formatSAR(n: number) {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function SponsorDetail() {
  const [, params] = useRoute("/sponsors/:id");
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const id = params?.id;
  const isNew = id === "new";

  const { data: sponsor, isLoading, refetch } = useGetSponsor(id ?? "", {
    query: { enabled: !!id && !isNew, queryKey: getGetSponsorQueryKey(id ?? "") },
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(isNew);

  useEffect(() => {
    if (!isNew && sponsor) {
      setForm({
        sponsorName: sponsor.sponsorName,
        company: sponsor.company,
        contactPerson: sponsor.contactPerson,
        phone: sponsor.phone,
        email: sponsor.email,
        tier: sponsor.tier as Tier,
        totalAmount: String(sponsor.totalAmount ?? 0),
        paidAmount: String(sponsor.paidAmount ?? 0),
        status: sponsor.status as Status,
        assignedStaff: sponsor.assignedStaff,
        linkedEvent: sponsor.linkedEvent,
        dueDate: sponsor.dueDate ? sponsor.dueDate.slice(0, 10) : "",
        notes: sponsor.notes,
      });
    }
  }, [sponsor, isNew]);

  const createMutation = useCreateSponsor({
    mutation: {
      onSuccess: (created) => {
        toast({ title: "Sponsor created" });
        setLocation(`/sponsors/${created.id}`);
      },
      onError: (err) =>
        toast({
          title: "Could not create",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        }),
    },
  });

  const updateMutation = useUpdateSponsor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Saved" });
        setEditing(false);
        refetch();
      },
      onError: (err) =>
        toast({
          title: "Could not save",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        }),
    },
  });

  const deleteMutation = useDeleteSponsor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sponsor deleted" });
        setLocation("/sponsors");
      },
      onError: (err) =>
        toast({
          title: "Could not delete",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        }),
    },
  });

  const pending = useMemo(() => {
    const t = Number(form.totalAmount) || 0;
    const p = Number(form.paidAmount) || 0;
    return Math.max(t - p, 0);
  }, [form.totalAmount, form.paidAmount]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sponsorName.trim()) {
      toast({ title: "Sponsor name is required", variant: "destructive" });
      return;
    }
    const payload = {
      sponsorName: form.sponsorName.trim(),
      company: form.company.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      tier: form.tier,
      totalAmount: Number(form.totalAmount) || 0,
      paidAmount: Number(form.paidAmount) || 0,
      status: form.status,
      assignedStaff: form.assignedStaff.trim(),
      linkedEvent: form.linkedEvent.trim(),
      dueDate: form.dueDate
        ? new Date(form.dueDate + "T00:00:00.000Z").toISOString()
        : null,
      notes: form.notes,
    };
    if (isNew) {
      createMutation.mutate({ data: payload });
    } else if (id) {
      updateMutation.mutate({ id, data: payload });
    }
  };

  const onDelete = () => {
    if (!sponsor || !id) return;
    if (!confirm(`Delete sponsor "${sponsor.sponsorName}"?`)) return;
    deleteMutation.mutate({ id });
  };

  if (!isNew && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!isNew && !sponsor) {
    return (
      <div className="text-center py-12 text-green-700/70">
        Sponsor not found.{" "}
        <Link href="/sponsors" className="text-green-800 underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/sponsors">
            <Button variant="ghost" size="sm" className="text-green-800">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-green-950">
              {isNew ? "New Sponsor" : sponsor!.sponsorName}
            </h1>
            {!isNew && (
              <p className="text-sm text-green-700/70">
                {sponsor!.company || sponsor!.contactPerson || "—"}
              </p>
            )}
          </div>
        </div>
        {!isNew && canDelete && (
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={onDelete}
            data-testid="button-delete-sponsor"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      {!isNew && sponsor && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="rounded-2xl border-green-100">
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-xl text-green-950">
                {formatSAR(sponsor.totalAmount)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl border-green-100">
            <CardHeader className="pb-2">
              <CardDescription>Paid</CardDescription>
              <CardTitle className="text-xl text-green-800">
                {formatSAR(sponsor.paidAmount)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl border-green-100">
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle
                className={cn(
                  "text-xl",
                  sponsor.pendingAmount > 0 ? "text-orange-700" : "text-green-700",
                )}
              >
                {formatSAR(sponsor.pendingAmount)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl border-green-100">
            <CardHeader className="pb-2">
              <CardDescription>Status / Tier</CardDescription>
              <div className="flex gap-2 mt-1">
                <Badge className="capitalize bg-green-100 text-green-900 ring-1 ring-green-300">
                  {sponsor.status}
                </Badge>
                <Badge className="capitalize bg-yellow-100 text-yellow-900 ring-1 ring-yellow-300">
                  {sponsor.tier}
                </Badge>
              </div>
            </CardHeader>
          </Card>
          <Card
            className="rounded-2xl border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-100 shadow-md ring-1 ring-green-200 dark:border-green-600 dark:from-green-950/50 dark:to-emerald-900/40 dark:ring-green-800"
            data-testid="card-assigned-staff"
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-green-800 font-semibold dark:text-green-300">
                Assigned Staff
              </CardDescription>
              <CardTitle className="text-xl text-green-950 dark:text-green-100">
                {sponsor.assignedStaff || "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card className="rounded-2xl border-green-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-green-950">
              {isNew ? "Sponsor details" : editing ? "Edit sponsor" : "Sponsor details"}
            </CardTitle>
            <CardDescription>
              {isNew
                ? "Fill in the details below."
                : editing
                  ? "Make your changes and save."
                  : "Read-only view. Click Edit to modify."}
            </CardDescription>
          </div>
          {!isNew && canEdit && !editing && (
            <Button
              variant="outline"
              className="border-green-300 text-green-800"
              onClick={() => setEditing(true)}
              data-testid="button-edit-sponsor"
            >
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sponsor name *">
              <Input
                value={form.sponsorName}
                onChange={(e) => setForm({ ...form, sponsorName: e.target.value })}
                disabled={!editing && !isNew}
                data-testid="input-sponsor-name"
                required
              />
            </Field>
            <Field label="Company">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Contact person">
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Tier">
              <Select
                value={form.tier}
                onValueChange={(v) => setForm({ ...form, tier: v as Tier })}
                disabled={!editing && !isNew}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Total amount (SAR)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Paid amount (SAR)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.paidAmount}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Pending amount (SAR)">
              <Input value={formatSAR(pending)} readOnly disabled />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Status })}
                disabled={!editing && !isNew}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assigned staff">
              <Input
                value={form.assignedStaff}
                onChange={(e) => setForm({ ...form, assignedStaff: e.target.value })}
                disabled={!editing && !isNew}
                placeholder="e.g. finance1"
              />
            </Field>
            <Field label="Linked event">
              <Input
                value={form.linkedEvent}
                onChange={(e) => setForm({ ...form, linkedEvent: e.target.value })}
                disabled={!editing && !isNew}
                placeholder="e.g. Annual Gala 2026"
              />
            </Field>
            <Field label="Due date">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                disabled={!editing && !isNew}
              />
            </Field>
            <Field label="Notes" full>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                disabled={!editing && !isNew}
                rows={3}
              />
            </Field>

            {(editing || isNew) && (
              <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
                {!isNew && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  className="bg-green-700 hover:bg-green-800 text-white"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-sponsor"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isNew ? "Create sponsor" : "Save changes"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-xs uppercase tracking-wider text-green-800/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
