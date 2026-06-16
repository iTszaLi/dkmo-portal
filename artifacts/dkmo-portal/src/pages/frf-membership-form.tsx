import { useState, useEffect, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import {
  useCreateFrfMembership,
  useUpdateFrfMembership,
  useGetFrfMembership,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ChevronRight, ChevronLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Dependent {
  fullName: string;
  relation: string;
  age: string;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const MARITAL_STATUS = ["Single", "Married", "Widowed", "Divorced"];
const STATUS_OPTIONS = ["submitted", "under_review", "approved", "rejected", "completed"];

const STEPS = [
  { label: "Personal Info" },
  { label: "Saudi Contact" },
  { label: "India Contact" },
  { label: "Nominee & Dependents" },
  { label: "Referral Info" },
];

const EMPTY_FORM = {
  fullName: "", dateOfBirth: "", bloodGroup: "", maritalStatus: "",
  passportNumber: "", iqamaNumber: "", occupation: "", companyName: "",
  mobileSaudi: "", email: "", areaSaudi: "", poBox: "", businessPhone: "",
  emergencyNameSaudi: "", emergencyMobileSaudi: "",
  houseName: "", postalAddress: "", district: "", nearestJamaath: "",
  homePhone: "", mobileIndia: "", emergencyNameIndia: "", emergencyMobileIndia: "",
  nomineeName: "", nomineeRelation: "", nomineeMobile: "", notes: "",
  status: "submitted",
  referrerMemberName: "", referrerDkmoId: "", referrerFrfNumber: "",
  referralCode: "", referralDate: "",
};

function FieldRow({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-green-900 dark:text-green-300 font-medium text-sm">{label}</Label>
      {children}
    </div>
  );
}

const inputCls = "border-green-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 focus-visible:border-green-700";

export default function FrfMembershipFormPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Detect edit mode via route
  const [isEditRoute, editParams] = useRoute("/frf-membership/:id/edit");
  const editId = isEditRoute ? (editParams?.id ?? "") : "";
  const isEditMode = !!editId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMembership, isLoading: isLoadingExisting } = useGetFrfMembership(editId, { query: { enabled: isEditMode } as any });

  // Pre-populate form when editing
  useEffect(() => {
    if (!existingMembership) return;
    const m = existingMembership;
    setForm({
      fullName: m.fullName ?? "",
      dateOfBirth: m.dateOfBirth ?? "",
      bloodGroup: m.bloodGroup ?? "",
      maritalStatus: m.maritalStatus ?? "",
      passportNumber: m.passportNumber ?? "",
      iqamaNumber: m.iqamaNumber ?? "",
      occupation: m.occupation ?? "",
      companyName: m.companyName ?? "",
      mobileSaudi: m.mobileSaudi ?? "",
      email: m.email ?? "",
      areaSaudi: m.areaSaudi ?? "",
      poBox: m.poBox ?? "",
      businessPhone: m.businessPhone ?? "",
      emergencyNameSaudi: m.emergencyNameSaudi ?? "",
      emergencyMobileSaudi: m.emergencyMobileSaudi ?? "",
      houseName: m.houseName ?? "",
      postalAddress: m.postalAddress ?? "",
      district: m.district ?? "",
      nearestJamaath: m.nearestJamaath ?? "",
      homePhone: m.homePhone ?? "",
      mobileIndia: m.mobileIndia ?? "",
      emergencyNameIndia: m.emergencyNameIndia ?? "",
      emergencyMobileIndia: m.emergencyMobileIndia ?? "",
      nomineeName: m.nomineeName ?? "",
      nomineeRelation: m.nomineeRelation ?? "",
      nomineeMobile: m.nomineeMobile ?? "",
      notes: m.notes ?? "",
      status: (m.status || "submitted") as string,
      referrerMemberName: (m as any).referrerMemberName ?? "",
      referrerDkmoId: (m as any).referrerDkmoId ?? "",
      referrerFrfNumber: (m as any).referrerFrfNumber ?? "",
      referralCode: (m as any).referralCode ?? "",
      referralDate: (m as any).referralDate ?? "",
    });
    if (m.dependents && m.dependents.length > 0) {
      setDependents(m.dependents.map((d: { fullName: string; relation: string; age?: number | null }) => ({
        fullName: d.fullName ?? "",
        relation: d.relation ?? "",
        age: d.age != null ? String(d.age) : "",
      })));
    }
  }, [existingMembership]);

  const { mutateAsync: createMembership, isPending: isCreating } = useCreateFrfMembership();
  const { mutateAsync: updateMembership, isPending: isUpdating } = useUpdateFrfMembership();
  const isPending = isCreating || isUpdating;

  const set = (field: keyof typeof form, value: string) => setForm((f) => ({ ...f, [field]: value }));
  const addDependent = () => setDependents((d) => [...d, { fullName: "", relation: "", age: "" }]);
  const removeDependent = (i: number) => setDependents((d) => d.filter((_, idx) => idx !== i));
  const setDependent = (i: number, field: keyof Dependent, value: string) =>
    setDependents((d) => d.map((dep, idx) => (idx === i ? { ...dep, [field]: value } : dep)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) { setError("Full name is required."); return; }
    setError(null);
    const payload = {
      ...form,
      status: form.status || "submitted",
      numDependents: dependents.length,
      dependents: dependents
        .filter((d) => d.fullName.trim())
        .map((d) => ({ fullName: d.fullName, relation: d.relation, age: d.age ? parseInt(d.age, 10) : null })),
    };
    try {
      if (isEditMode) {
        await updateMembership({ id: editId, data: payload });
        toast({ title: "FRF membership updated" });
        setLocation(`/frf-membership/${editId}`);
      } else {
        const created = await createMembership({ data: payload });
        toast({ title: "FRF membership created", description: `FRF Number: ${created.frfNumber}` });
        setLocation(`/frf-membership/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? "update" : "create"} membership.`);
    }
  }

  const backPath = isEditMode ? `/frf-membership/${editId}` : "/frf-membership";

  if (isEditMode && isLoadingExisting) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-green-700" />
        <span className="ml-3 text-green-800 dark:text-slate-300">Loading membership…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(backPath)}
          className="text-green-800 hover:bg-green-50 dark:hover:bg-slate-800">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">
            {isEditMode ? "Edit FRF Membership" : "New FRF Membership"}
          </h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400">
            {isEditMode
              ? `Editing: ${existingMembership?.frfNumber ?? editId}`
              : "Admin entry — FRF number auto-assigned"}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                i === step ? "bg-green-800 text-white shadow-sm"
                : i < step ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 cursor-pointer hover:bg-green-200"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
              }`}>
              <span className="h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold border border-current">{i + 1}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-4 bg-slate-300 dark:bg-slate-700 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {step === 0 && (
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader><CardTitle className="text-base text-green-900 dark:text-green-100">Personal Information</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FieldRow label="Full Name *" id="fn"><Input id="fn" className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required /></FieldRow>
              </div>
              <FieldRow label="Date of Birth"><Input type="date" className={inputCls} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></FieldRow>
              <FieldRow label="Blood Group">
                <Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Marital Status">
                <Select value={form.maritalStatus} onValueChange={(v) => set("maritalStatus", v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{MARITAL_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Passport Number"><Input className={inputCls} value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value)} /></FieldRow>
              <FieldRow label="Iqama Number"><Input className={inputCls} value={form.iqamaNumber} onChange={(e) => set("iqamaNumber", e.target.value)} /></FieldRow>
              <FieldRow label="Occupation"><Input className={inputCls} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} /></FieldRow>
              <FieldRow label="Company"><Input className={inputCls} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></FieldRow>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader><CardTitle className="text-base text-green-900 dark:text-green-100">Saudi Arabia Contact</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="Mobile (Saudi)"><Input className={inputCls} value={form.mobileSaudi} onChange={(e) => set("mobileSaudi", e.target.value)} /></FieldRow>
              <FieldRow label="Email"><Input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} /></FieldRow>
              <FieldRow label="Area / City"><Input className={inputCls} value={form.areaSaudi} onChange={(e) => set("areaSaudi", e.target.value)} /></FieldRow>
              <FieldRow label="P.O. Box"><Input className={inputCls} value={form.poBox} onChange={(e) => set("poBox", e.target.value)} /></FieldRow>
              <FieldRow label="Business Phone"><Input className={inputCls} value={form.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} /></FieldRow>
              <div className="sm:col-span-2"><Separator /></div>
              <FieldRow label="Emergency Name (Saudi)"><Input className={inputCls} value={form.emergencyNameSaudi} onChange={(e) => set("emergencyNameSaudi", e.target.value)} /></FieldRow>
              <FieldRow label="Emergency Mobile (Saudi)"><Input className={inputCls} value={form.emergencyMobileSaudi} onChange={(e) => set("emergencyMobileSaudi", e.target.value)} /></FieldRow>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader><CardTitle className="text-base text-green-900 dark:text-green-100">Kerala Home Address</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="House Name"><Input className={inputCls} value={form.houseName} onChange={(e) => set("houseName", e.target.value)} /></FieldRow>
              <FieldRow label="Postal Address"><Input className={inputCls} value={form.postalAddress} onChange={(e) => set("postalAddress", e.target.value)} /></FieldRow>
              <FieldRow label="District"><Input className={inputCls} value={form.district} onChange={(e) => set("district", e.target.value)} /></FieldRow>
              <FieldRow label="Nearest Jamaath"><Input className={inputCls} value={form.nearestJamaath} onChange={(e) => set("nearestJamaath", e.target.value)} /></FieldRow>
              <FieldRow label="Home Phone (India)"><Input className={inputCls} value={form.homePhone} onChange={(e) => set("homePhone", e.target.value)} /></FieldRow>
              <FieldRow label="Mobile (India)"><Input className={inputCls} value={form.mobileIndia} onChange={(e) => set("mobileIndia", e.target.value)} /></FieldRow>
              <div className="sm:col-span-2"><Separator /></div>
              <FieldRow label="Emergency Name (India)"><Input className={inputCls} value={form.emergencyNameIndia} onChange={(e) => set("emergencyNameIndia", e.target.value)} /></FieldRow>
              <FieldRow label="Emergency Mobile (India)"><Input className={inputCls} value={form.emergencyMobileIndia} onChange={(e) => set("emergencyMobileIndia", e.target.value)} /></FieldRow>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader><CardTitle className="text-base text-green-900 dark:text-green-100">Nominee</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FieldRow label="Nominee Name"><Input className={inputCls} value={form.nomineeName} onChange={(e) => set("nomineeName", e.target.value)} /></FieldRow>
                <FieldRow label="Relation"><Input className={inputCls} value={form.nomineeRelation} onChange={(e) => set("nomineeRelation", e.target.value)} /></FieldRow>
                <FieldRow label="Nominee Mobile"><Input className={inputCls} value={form.nomineeMobile} onChange={(e) => set("nomineeMobile", e.target.value)} /></FieldRow>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-green-900 dark:text-green-100">Dependents</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addDependent}
                  className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {dependents.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-3">No dependents added</p>
                ) : (
                  dependents.map((dep, i) => (
                    <div key={i} className="grid sm:grid-cols-3 gap-3 p-3 rounded-xl border border-green-100 dark:border-slate-700 bg-green-50/30 dark:bg-slate-800/30">
                      <Input value={dep.fullName} onChange={(e) => setDependent(i, "fullName", e.target.value)} className={inputCls} placeholder="Full name" />
                      <Input value={dep.relation} onChange={(e) => setDependent(i, "relation", e.target.value)} className={inputCls} placeholder="Relation" />
                      <div className="flex gap-2">
                        <Input value={dep.age} onChange={(e) => setDependent(i, "age", e.target.value)} type="number" min="0" max="99" className={`${inputCls} flex-1`} placeholder="Age" />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeDependent(i)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardContent className="pt-4">
                <FieldRow label="Notes">
                  <Textarea className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
                </FieldRow>
              </CardContent>
            </Card>
          </>
        )}

        {step === 4 && (
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-green-900 dark:text-green-100">Referral Information</CardTitle>
              <p className="text-sm text-green-700/70 dark:text-slate-400 mt-0.5">
                Optional — fill in if this applicant was referred by an existing FRF member.
              </p>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FieldRow label="Referrer Full Name">
                  <Input className={inputCls} value={form.referrerMemberName} onChange={(e) => set("referrerMemberName", e.target.value)} placeholder="Full name of the referring member" />
                </FieldRow>
              </div>
              <FieldRow label="Referrer DKMO ID">
                <Input className={inputCls} value={form.referrerDkmoId} onChange={(e) => set("referrerDkmoId", e.target.value)} placeholder="e.g. DKMO-0001" />
              </FieldRow>
              <FieldRow label="Referrer FRF Number">
                <Input className={inputCls} value={form.referrerFrfNumber} onChange={(e) => set("referrerFrfNumber", e.target.value)} placeholder="e.g. FRF-2601" />
              </FieldRow>
              <FieldRow label="Referral Code">
                <Input className={inputCls} value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} placeholder="Optional referral code" />
              </FieldRow>
              <FieldRow label="Referral Date">
                <Input type="date" className={inputCls} value={form.referralDate} onChange={(e) => set("referralDate", e.target.value)} />
              </FieldRow>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between items-center">
          <Button type="button" variant="outline"
            className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300"
            onClick={() => step > 0 ? setStep(step - 1) : setLocation(backPath)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? "Cancel" : "Previous"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button"
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
              onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white">
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isEditMode ? "Saving…" : "Creating…"}</>
                : isEditMode ? "Save Changes" : "Create Membership"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
