import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetFrfMembership,
  useUpdateFrfMembership,
  useDeleteFrfMembership,
  useAddFrfDependent,
  useDeleteFrfDependent,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Phone, MapPin, User, Briefcase, Users, Printer, Download, Trash2, Edit, Plus, X, MessageCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { generateFrfPdf } from "@/lib/frf-pdf";

function formatWhatsAppNumber(mobile: string) {
  return mobile.replace(/[^0-9]/g, "");
}

function openWhatsApp(mobile: string, message: string) {
  const num = formatWhatsAppNumber(mobile);
  if (!num) return;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, "_blank");
}

function buildApprovalMessage(fullName: string, frfNumber: string) {
  return `Assalamu Alaikum ${fullName},

We are pleased to inform you that your FRF (Family Relief Fund) application *No. ${frfNumber}* with DKMO has been *APPROVED* ✅.

Welcome to the DKMO Family Relief Fund!

For any queries, please contact the DKMO General Secretary.

Jazakallah Khair,
*DKMO – Dakshina Karnataka Muslim Ookota*`;
}

function buildDeclineMessage(fullName: string, frfNumber: string, reason: string) {
  return `Assalamu Alaikum ${fullName},

We regret to inform you that your FRF (Family Relief Fund) application *No. ${frfNumber}* with DKMO has been *DECLINED* ❌.

*Reason:* ${reason}

If you have any queries or wish to reapply, please contact the DKMO General Secretary.

Jazakallah Khair,
*DKMO – Dakshina Karnataka Muslim Ookota*`;
}

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "approved", label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "completed", label: "Completed", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4">
      <span className="text-xs text-slate-500 dark:text-slate-400 sm:min-w-[140px] sm:text-right">{label}</span>
      <span className="text-sm text-green-950 dark:text-slate-200 font-medium">{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-green-900 dark:text-green-300 flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

export default function FrfMembershipDetailPage() {
  const [, params] = useRoute("/frf-membership/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id ?? "";

  const { data: membership, isLoading, refetch } = useGetFrfMembership(id, { query: { enabled: !!id } });
  const { mutateAsync: updateMembership } = useUpdateFrfMembership();
  const { mutateAsync: deleteMembership, isPending: isDeleting } = useDeleteFrfMembership();
  const { mutateAsync: addDependent } = useAddFrfDependent();
  const { mutateAsync: deleteDependent } = useDeleteFrfDependent();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newDepName, setNewDepName] = useState("");
  const [newDepRelation, setNewDepRelation] = useState("");
  const [newDepAge, setNewDepAge] = useState("");
  const [addingDep, setAddingDep] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [sendingDecline, setSendingDecline] = useState(false);

  const statusInfo = STATUS_OPTIONS.find((s) => s.value === membership?.status) ?? STATUS_OPTIONS[0];

  const primaryMobile = membership?.mobileSaudi || membership?.mobileIndia || "";

  async function handleStatusChange(newStatus: string) {
    if (!membership) return;
    if (newStatus === "rejected") {
      setDeclineReason("");
      setDeclineDialogOpen(true);
      return;
    }
    await updateMembership({ id, data: { status: newStatus, fullName: membership.fullName } });
    toast({ title: "Status updated" });
    void refetch();
    if (newStatus === "approved" && primaryMobile) {
      openWhatsApp(primaryMobile, buildApprovalMessage(membership.fullName, membership.frfNumber));
    }
  }

  async function handleConfirmDecline() {
    if (!membership) return;
    setSendingDecline(true);
    try {
      await updateMembership({ id, data: { status: "rejected", declineReason: declineReason.trim(), fullName: membership.fullName } });
      toast({ title: "Application declined", description: "Status updated to Rejected." });
      void refetch();
      setDeclineDialogOpen(false);
      if (primaryMobile) {
        openWhatsApp(primaryMobile, buildDeclineMessage(membership.fullName, membership.frfNumber, declineReason.trim() || "No specific reason provided."));
      }
    } finally {
      setSendingDecline(false);
    }
  }

  async function handleDelete() {
    await deleteMembership({ id });
    toast({ title: "Deleted", description: "FRF membership removed." });
    setLocation("/frf-membership");
  }

  async function handleAddDependent() {
    if (!newDepName.trim()) return;
    setAddingDep(true);
    try {
      await addDependent({ id, data: { fullName: newDepName.trim(), relation: newDepRelation, age: newDepAge ? parseInt(newDepAge, 10) : null } });
      setNewDepName(""); setNewDepRelation(""); setNewDepAge("");
      toast({ title: "Dependent added" });
      void refetch();
    } finally {
      setAddingDep(false);
    }
  }

  async function handleDeleteDependent(depId: string) {
    await deleteDependent({ id: depId });
    toast({ title: "Dependent removed" });
    void refetch();
  }

  function handlePrint() {
    window.print();
  }

  function handleDownloadPdf() {
    if (!membership) return;
    const deps = ((membership as any).dependents ?? []) as Array<{ fullName?: string; relation?: string; age?: number | null }>;
    const submittedDate = membership.createdAt
      ? new Date(membership.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    void generateFrfPdf(
      {
        fullName: membership.fullName,
        dateOfBirth: membership.dateOfBirth,
        passportNumber: membership.passportNumber,
        iqamaNumber: membership.iqamaNumber,
        occupation: membership.occupation,
        companyName: membership.companyName,
        maritalStatus: membership.maritalStatus,
        bloodGroup: membership.bloodGroup,
        photoDataUrl: (membership as any).photoUrl ?? null,
        areaSaudi: membership.areaSaudi,
        poBox: membership.poBox,
        businessPhone: membership.businessPhone,
        mobileSaudi: membership.mobileSaudi,
        email: membership.email,
        emergencyNameSaudi: membership.emergencyNameSaudi,
        emergencyMobileSaudi: membership.emergencyMobileSaudi,
        houseName: membership.houseName,
        postalAddress: membership.postalAddress,
        district: membership.district,
        nearestJamaath: membership.nearestJamaath,
        homePhone: membership.homePhone,
        mobileIndia: membership.mobileIndia,
        emergencyNameIndia: membership.emergencyNameIndia,
        emergencyMobileIndia: membership.emergencyMobileIndia,
        notes: membership.notes,
      },
      deps.map((d) => ({ fullName: d.fullName, relation: d.relation, age: d.age })),
      membership.frfNumber,
      submittedDate,
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>FRF membership not found.</p>
        <Button variant="link" onClick={() => setLocation("/frf-membership")}>Back to list</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/frf-membership")} className="text-green-800 hover:bg-green-50 dark:hover:bg-slate-800">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">{membership.fullName}</h1>
            <p className="text-sm text-green-700/70 dark:text-slate-400 font-mono">{membership.frfNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={membership.status} onValueChange={handleStatusChange}>
            <SelectTrigger className={`w-40 border-0 font-medium text-xs h-8 ${statusInfo?.color}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handlePrint}
            className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 hover:bg-green-50">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}
            className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 hover:bg-green-50">
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation(`/frf-membership/${id}/edit`)}
            className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 hover:bg-green-50">
            <Edit className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)}
            className="border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-xl font-bold">DKMO — FRF Membership Card</h1>
        <p className="text-sm font-mono mt-1">{membership.frfNumber}</p>
        <p className="text-lg font-semibold mt-1">{membership.fullName}</p>
        <p className="text-sm text-slate-500">Status: {statusInfo?.label} · Applied: {formatDate(membership.createdAt)}</p>
      </div>

      {/* Info Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Section title="Personal Details" icon={User}>
          <InfoRow label="Full Name" value={membership.fullName} />
          <InfoRow label="Date of Birth" value={membership.dateOfBirth ?? undefined} />
          <InfoRow label="Blood Group" value={membership.bloodGroup || undefined} />
          <InfoRow label="Marital Status" value={membership.maritalStatus || undefined} />
          <InfoRow label="Passport #" value={membership.passportNumber || undefined} />
          <InfoRow label="Iqama #" value={membership.iqamaNumber || undefined} />
        </Section>

        <Section title="Work Information" icon={Briefcase}>
          <InfoRow label="Occupation" value={membership.occupation || undefined} />
          <InfoRow label="Company" value={membership.companyName || undefined} />
          <InfoRow label="Area / City (Saudi)" value={membership.areaSaudi || undefined} />
          <InfoRow label="P.O. Box" value={membership.poBox || undefined} />
          <InfoRow label="Business Phone" value={membership.businessPhone || undefined} />
        </Section>

        <Section title="Saudi Contact" icon={Phone}>
          <InfoRow label="Mobile (Saudi)" value={membership.mobileSaudi || undefined} />
          <InfoRow label="Email" value={membership.email || undefined} />
          <InfoRow label="Emergency Name" value={membership.emergencyNameSaudi || undefined} />
          <InfoRow label="Emergency Mobile" value={membership.emergencyMobileSaudi || undefined} />
        </Section>

        <Section title="India / Kerala Address" icon={MapPin}>
          <InfoRow label="House Name" value={membership.houseName || undefined} />
          <InfoRow label="Postal Address" value={membership.postalAddress || undefined} />
          <InfoRow label="District" value={membership.district || undefined} />
          <InfoRow label="Nearest Jamaath" value={membership.nearestJamaath || undefined} />
          <InfoRow label="Home Phone" value={membership.homePhone || undefined} />
          <InfoRow label="Mobile (India)" value={membership.mobileIndia || undefined} />
        </Section>

        <Section title="India Emergency Contact" icon={Phone}>
          <InfoRow label="Emergency Name" value={membership.emergencyNameIndia || undefined} />
          <InfoRow label="Emergency Mobile" value={membership.emergencyMobileIndia || undefined} />
        </Section>

        <Section title="Nominee" icon={User}>
          <InfoRow label="Nominee Name" value={membership.nomineeName || undefined} />
          <InfoRow label="Relation" value={membership.nomineeRelation || undefined} />
          <InfoRow label="Mobile" value={membership.nomineeMobile || undefined} />
          {membership.notes && <InfoRow label="Notes" value={membership.notes} />}
          <InfoRow label="Applied" value={formatDate(membership.createdAt)} />
          {membership.membershipDate && <InfoRow label="Membership Date" value={membership.membershipDate} />}
        </Section>
      </div>

      {/* Dependents */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-green-900 dark:text-green-300 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Dependents ({(membership as any).dependents?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {((membership as any).dependents ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-3">No dependents recorded.</p>
          ) : (
            <div className="divide-y divide-green-50 dark:divide-slate-800">
              {((membership as any).dependents ?? []).map((dep: any) => (
                <div key={dep.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-green-950 dark:text-slate-200">{dep.fullName}</p>
                    <p className="text-xs text-slate-500">{dep.relation}{dep.age ? ` · Age ${dep.age}` : ""}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 print:hidden"
                    onClick={() => handleDeleteDependent(dep.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add dependent form */}
          <div className="pt-2 border-t border-green-100 dark:border-slate-800 print:hidden">
            <p className="text-xs text-green-700 dark:text-green-500 font-medium mb-2">Add dependent</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={newDepName} onChange={(e) => setNewDepName(e.target.value)}
                placeholder="Full name" className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm" />
              <Input value={newDepRelation} onChange={(e) => setNewDepRelation(e.target.value)}
                placeholder="Relation" className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm sm:w-32" />
              <Input value={newDepAge} onChange={(e) => setNewDepAge(e.target.value)}
                type="number" placeholder="Age" className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm sm:w-20" />
              <Button size="sm" disabled={!newDepName.trim() || addingDep} onClick={handleAddDependent}
                className="bg-green-800 hover:bg-green-900 text-white">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FRF membership?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove {membership.fullName}'s membership and all dependents.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-700 dark:text-red-400">Decline Application</DialogTitle>
            <DialogDescription>
              Provide a reason for declining <strong>{membership.fullName}</strong>'s application. This reason will be sent to the applicant via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="decline-reason" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Reason for declining <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="decline-reason"
              placeholder="e.g. Incomplete documentation, duplicate application, eligibility criteria not met…"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={4}
              className="border-red-200 dark:border-slate-700 dark:bg-slate-800/60 resize-none"
            />
            {primaryMobile ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                WhatsApp will open pre-filled to <span className="font-mono font-medium">{primaryMobile}</span>
              </p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No mobile number on record — WhatsApp notification will be skipped.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)} className="dark:border-slate-700">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDecline}
              disabled={!declineReason.trim() || sendingDecline}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {sendingDecline ? "Declining…" : "Decline & Notify via WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
