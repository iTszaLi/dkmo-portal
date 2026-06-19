import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle, XCircle, Clock, Users, Loader2, ChevronRight, ChevronLeft,
  Plus, Trash2, Download, Printer, ExternalLink, RefreshCw, Search, ChevronsUpDown, Check, ShieldCheck,
  Stethoscope, HandHeart, Siren, Plane, Globe2, HeartHandshake, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/ThemeToggle";
import { generateDkmoPdf } from "@/lib/dkmo-pdf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB original-file ceiling

/**
 * Resizes and compresses an image file to a small JPEG data URL so the
 * submission payload stays well under the server's body limit. The longest edge
 * is capped at 800px and quality reduced until the result is comfortably small.
 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That file does not appear to be a valid image."));
    el.src = dataUrl;
  });

  const MAX_EDGE = 800;
  let { width, height } = img;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    if (width >= height) {
      height = Math.round((height * MAX_EDGE) / width);
      width = MAX_EDGE;
    } else {
      width = Math.round((width * MAX_EDGE) / height);
      height = MAX_EDGE;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.8;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 600_000 && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

const DKMO_BENEFITS = [
  { icon: Stethoscope, title: "Medical Aid", desc: "Assistance for hospital bills, surgeries and treatment.", color: "text-rose-600 dark:text-rose-400", tile: "bg-rose-100 dark:bg-rose-900/40" },
  { icon: HandHeart, title: "General Relief Fund", desc: "Support for families facing financial hardship.", color: "text-amber-600 dark:text-amber-400", tile: "bg-amber-100 dark:bg-amber-900/40" },
  { icon: Siren, title: "Emergency Response", desc: "Rapid help during accidents and crises.", color: "text-red-600 dark:text-red-400", tile: "bg-red-100 dark:bg-red-900/40" },
  { icon: Plane, title: "Air Ticket Assistance", desc: "Travel support for repatriation and emergencies.", color: "text-sky-600 dark:text-sky-400", tile: "bg-sky-100 dark:bg-sky-900/40" },
  { icon: Globe2, title: "India Representative Support", desc: "On-ground coordination back home in India.", color: "text-green-700 dark:text-green-400", tile: "bg-green-100 dark:bg-green-900/40" },
  { icon: HeartHandshake, title: "Family Relief Fund", desc: "Death-benefit claims for registered members.", color: "text-green-700 dark:text-green-400", tile: "bg-green-100 dark:bg-green-900/40" },
  { icon: Landmark, title: "Interest-Free Loans", desc: "Benevolent Qard-e-Hasana loans in time of need.", color: "text-blue-700 dark:text-blue-400", tile: "bg-blue-100 dark:bg-blue-900/40" },
];

// ── Validation helpers ────────────────────────────────────────────────────────
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
function isValidIqama(v: string) {
  return v === "" || /^\d{10}$/.test(v.trim());
}
function isValidSaudiMobile(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10;
}
function isValidIndiaMobile(v: string) {
  return v === "" || /^\d{10}$/.test(v.replace(/\D/g, ""));
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dependent {
  fullName: string;
  relation: string;
  age: string;
}

interface MemberEntry {
  id: string;
  fullName: string;
  membershipId: string;
}

interface FormData {
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  maritalStatus: string;
  familyInSaudi: string;
  passportNumber: string;
  iqamaNumber: string;
  occupation: string;
  companyName: string;
  refMemberId: string;
  refMemberName: string;
  mobileSaudi: string;
  email: string;
  areaSaudi: string;
  poBox: string;
  businessPhone: string;
  emergencyNameSaudi: string;
  emergencyMobileSaudi: string;
  houseName: string;
  postalAddress: string;
  district: string;
  nearestJamaath: string;
  homePhone: string;
  mobileIndia: string;
  emergencyNameIndia: string;
  emergencyMobileIndia: string;
  notes: string;
  photoDataUrl: string;
}

const EMPTY_FORM: FormData = {
  fullName: "", dateOfBirth: "", bloodGroup: "", maritalStatus: "", familyInSaudi: "",
  passportNumber: "", iqamaNumber: "", occupation: "", companyName: "",
  refMemberId: "", refMemberName: "",
  mobileSaudi: "", email: "", areaSaudi: "", poBox: "", businessPhone: "",
  emergencyNameSaudi: "", emergencyMobileSaudi: "",
  houseName: "", postalAddress: "", district: "", nearestJamaath: "",
  homePhone: "", mobileIndia: "", emergencyNameIndia: "", emergencyMobileIndia: "",
  notes: "", photoDataUrl: "",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const MARITAL_STATUS = ["Single", "Married", "Widowed", "Divorced"];

const STEPS = [
  { label: "Personal Info",  desc: "Basic details & identification" },
  { label: "Saudi Contact",  desc: "Saudi Arabia contact & work info" },
  { label: "India Contact",  desc: "Home address & contacts" },
  { label: "Dependants",     desc: "Family members & additional notes" },
];

// ── Helper components ─────────────────────────────────────────────────────────
function FieldRow({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-green-900 dark:text-green-300 font-medium text-sm">{label}</Label>
      {children}
    </div>
  );
}

function inputClass(extra = "") {
  return `border-green-200 dark:border-slate-700 focus-visible:border-green-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 ${extra}`;
}

function errCls(hasErr: boolean) {
  return hasErr ? "border-red-400 dark:border-red-500" : "";
}

type AppStatus = "submitted" | "under_review" | "approved" | "rejected" | "completed";

function StatusIcon({ status }: { status: AppStatus }) {
  if (status === "approved" || status === "completed") {
    return <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center"><CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" /></div>;
  }
  if (status === "rejected") {
    return <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center"><XCircle className="h-8 w-8 text-red-500 dark:text-red-400" /></div>;
  }
  return <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center"><Clock className="h-8 w-8 text-amber-500 dark:text-amber-400" /></div>;
}

// ── Reference member searchable dropdown ──────────────────────────────────────
function MemberPicker({ value, onChange, error }: { value: MemberEntry | null; onChange: (m: MemberEntry | null) => void; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${basePath}/api/dkmo/members-list`)
      .then((r) => r.json())
      .then((data: MemberEntry[]) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = members.filter((m) =>
    m.fullName.toLowerCase().includes(query.toLowerCase()) ||
    m.membershipId.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left transition-colors ${
          error
            ? "border-red-400 dark:border-red-600 bg-red-50/40 dark:bg-red-900/10"
            : value
            ? "border-green-400 dark:border-green-600 bg-green-50/60 dark:bg-green-900/20"
            : "border-green-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"
        } text-green-900 dark:text-slate-100`}
      >
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>
          {value ? `${value.fullName} (${value.membershipId})` : "Search and select a member…"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-green-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded border border-green-200 dark:border-slate-700 bg-transparent dark:text-slate-100 outline-none focus:border-green-500"
                placeholder="Type name or member ID…"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading && <p className="text-center text-xs text-slate-400 py-4">Loading members…</p>}
            {!loading && filtered.length === 0 && <p className="text-center text-xs text-slate-400 py-4">No members found</p>}
            {!loading && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => { onChange(null); setQuery(""); setOpen(false); }}
                >
                  — None / Clear selection
                </button>
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onChange(m); setOpen(false); setQuery(""); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors ${
                      value?.id === m.id ? "bg-green-50 dark:bg-green-900/30 font-semibold" : ""
                    }`}
                  >
                    {value?.id === m.id && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    <span className="text-green-900 dark:text-slate-100">{m.fullName}</span>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{m.membershipId}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DkmoApplyPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitted, setSubmitted] = useState<{
    dkmoNumber: string;
    fullName: string;
    submittedAt: string;
    formData: FormData;
    dependents: Dependent[];
    refMember: MemberEntry | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [appStatus, setAppStatus] = useState<AppStatus>("submitted");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [refMember, setRefMember] = useState<MemberEntry | null>(null);

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Restore draft
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("dkmoApplyDraft");
      if (saved) {
        const parsed = JSON.parse(saved) as { form?: FormData; dependents?: Dependent[]; step?: number };
        if (parsed.form) {
          setForm(parsed.form);
          if (parsed.form.refMemberId && parsed.form.refMemberName) {
            setRefMember({
              id: parsed.form.refMemberId,
              fullName: parsed.form.refMemberName,
              membershipId: parsed.form.refMemberId,
            });
          }
        }
        if (parsed.dependents) setDependents(parsed.dependents);
        if (typeof parsed.step === "number") setStep(parsed.step);
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-save draft
  useEffect(() => {
    try {
      sessionStorage.setItem("dkmoApplyDraft", JSON.stringify({ form, dependents, step }));
    } catch { /* ignore */ }
  }, [form, dependents, step]);

  const set = (field: keyof FormData, value: string) => setForm((f) => ({ ...f, [field]: value }));
  const addDependent = () => setDependents((d) => [...d, { fullName: "", relation: "", age: "" }]);
  const removeDependent = (i: number) => setDependents((d) => d.filter((_, idx) => idx !== i));
  const setDependent = (i: number, field: keyof Dependent, value: string) =>
    setDependents((d) => d.map((dep, idx) => (idx === i ? { ...dep, [field]: value } : dep)));

  async function handleCheckStatus() {
    if (!submitted) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`${basePath}/api/dkmo/memberships/track?dkmoNumber=${encodeURIComponent(submitted.dkmoNumber)}`);
      if (res.ok) {
        const list = await res.json() as Array<{ status?: string; declineReason?: string | null }>;
        const data = Array.isArray(list) ? list[0] : (list as any);
        if (data?.status) setAppStatus(data.status as AppStatus);
        setDeclineReason(data?.declineReason ?? null);
      }
    } catch { /* silently ignore */ } finally {
      setCheckingStatus(false);
    }
  }

  // Per-step validation
  const getStepErrors = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!form.fullName.trim()) errs.fullName = "Full name is required.";
      if (!form.dateOfBirth) errs.dateOfBirth = "Date of birth is required.";
      if (!form.passportNumber.trim()) errs.passportNumber = "Passport number is required.";
      if (!form.occupation.trim()) errs.occupation = "Occupation is required.";
      if (!form.iqamaNumber.trim()) {
        errs.iqamaNumber = "Iqama number is required.";
      } else if (!isValidIqama(form.iqamaNumber)) {
        errs.iqamaNumber = "Iqama must be exactly 10 digits.";
      }
      if (!refMember) errs.refMember = "Please select the member who referred you.";
    }
    if (step === 1) {
      if (!form.mobileSaudi.trim()) {
        errs.mobileSaudi = "Saudi mobile number is required.";
      } else if (!isValidSaudiMobile(form.mobileSaudi)) {
        errs.mobileSaudi = "Enter a valid Saudi mobile number (minimum 10 digits).";
      }
      if (!form.email.trim()) {
        errs.email = "Email address is required.";
      } else if (!isValidEmail(form.email)) {
        errs.email = "Enter a valid email address (e.g. name@gmail.com).";
      }
    }
    if (step === 2) {
      if (!form.houseName.trim()) errs.houseName = "House name / address is required.";
      if (!form.homePhone.trim()) errs.homePhone = "Home phone (India) is required.";
      if (form.mobileIndia.trim() && !isValidIndiaMobile(form.mobileIndia)) {
        errs.mobileIndia = "India mobile must be exactly 10 digits.";
      }
    }
    return errs;
  };

  const stepErrors = getStepErrors();
  const canAdvance = () => Object.keys(stepErrors).length === 0;

  const handleNext = () => {
    setShowValidation(true);
    if (canAdvance()) { setShowValidation(false); setStep(step + 1); window.scrollTo(0, 0); }
  };
  const handleBack = () => { setShowValidation(false); setStep(step - 1); window.scrollTo(0, 0); };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // guard against duplicate submissions
    if (!termsAccepted) { setError("You must confirm that all information is correct before submitting."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { photoDataUrl, ...rest } = form;
      const payload = {
        ...rest,
        photoUrl: photoDataUrl || null,
        refMemberName: refMember ? refMember.fullName : form.refMemberName,
        refMemberId: refMember ? refMember.membershipId : form.refMemberId,
        numDependents: dependents.length,
        dependents: dependents
          .filter((d) => d.fullName.trim())
          .map((d) => ({ fullName: d.fullName, relation: d.relation, age: d.age ? parseInt(d.age, 10) : null })),
      };
      const res = await fetch(`${basePath}/api/dkmo/memberships/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error || `Request failed (${res.status})`);
      }
      const data = await res.json() as { dkmoNumber: string; fullName: string };
      sessionStorage.removeItem("dkmoApplyDraft");
      setSubmitted({
        dkmoNumber: data.dkmoNumber,
        fullName: data.fullName,
        submittedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        formData: { ...form },
        dependents: [...dependents],
        refMember,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success Screen ────────────────────────────────────────────────────────────
  if (submitted) {
    const handleDownloadPdf = () => {
      void generateDkmoPdf(
        { ...submitted.formData, refMemberName: submitted.refMember?.fullName ?? submitted.formData.refMemberName, refMemberId: submitted.refMember?.membershipId ?? submitted.formData.refMemberId },
        submitted.dependents,
        submitted.dkmoNumber,
        submitted.submittedAt,
      );
    };
    const statusMap: Record<AppStatus, { label: string; color: string }> = {
      submitted:    { label: "Pending Approval", color: "text-amber-700 dark:text-amber-400" },
      under_review: { label: "Under Review",     color: "text-yellow-700 dark:text-yellow-400" },
      approved:     { label: "Approved ✓",        color: "text-green-700 dark:text-green-400" },
      completed:    { label: "Completed ✓",       color: "text-green-700 dark:text-green-400" },
      rejected:     { label: "Declined",          color: "text-red-600 dark:text-red-400" },
    };
    const si = statusMap[appStatus] ?? statusMap.submitted;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>
        <Card className="w-full max-w-lg rounded-2xl border-green-200 dark:border-green-900/50 shadow-xl dark:bg-slate-900">
          <CardContent className="pt-10 pb-8 flex flex-col items-center text-center gap-5">
            <StatusIcon status={appStatus} />
            <div>
              <h2 className="text-2xl font-bold text-green-900 dark:text-green-100">Application Submitted!</h2>
              <p className="mt-1 text-sm text-green-700/70 dark:text-green-500/80">Thank you, {submitted.fullName}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl px-6 py-4 w-full">
              <p className="text-xs text-green-700/70 dark:text-green-600 mb-1">Your DKMO Application Number</p>
              <p className="text-3xl font-bold text-green-800 dark:text-green-300 tracking-wider">{submitted.dkmoNumber}</p>
              <p className="text-xs text-green-600/60 dark:text-green-700/60 mt-1">Please save this for future reference</p>
            </div>
            <div className="w-full text-left space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Applicant</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{submitted.fullName}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Submission Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{submitted.submittedAt}</span>
              </div>
              <div className="flex justify-between items-start text-slate-600 dark:text-slate-400">
                <span>Status</span>
                <span className={`flex items-center gap-1 font-medium ${si.color}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />
                  {si.label}
                  <button onClick={handleCheckStatus} disabled={checkingStatus} className="ml-1 text-slate-400 hover:text-slate-600 disabled:opacity-40">
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
                  </button>
                </span>
              </div>
              {appStatus === "rejected" && declineReason && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-3 text-left">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Reason for declining:</p>
                  <p className="text-xs text-red-600 dark:text-red-300">{declineReason}</p>
                </div>
              )}
            </div>
            {(appStatus === "approved" || appStatus === "completed") && (
              <p className="text-sm text-green-700 dark:text-green-400 font-medium text-center">
                Congratulations! Your DKMO membership application has been approved. You will be contacted shortly.
              </p>
            )}
            {appStatus === "rejected" && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">
                Your application was not approved. Please contact the DKMO General Secretary for more information.
              </p>
            )}
            {appStatus === "submitted" || appStatus === "under_review" ? (
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                Your application is under review. You will be contacted at your provided mobile number once processed.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 w-full">
              <Button className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-2" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4" /> Download Application PDF
              </Button>
              <Button variant="outline" className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-2" onClick={handleDownloadPdf}>
                <Printer className="h-4 w-4" /> Print Application
              </Button>
              <Button variant="outline" size="sm" className="mt-1 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300" onClick={() => setLocation("/login")}>
                Back to Portal Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-8">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <img src={`${basePath}/logo-circle.png`} alt="DKMO" className="h-12 w-12 rounded-full object-cover" />
          <div>
            <h1 className="text-xl font-bold text-green-900 dark:text-green-100">DKMO Membership Application</h1>
            <p className="text-sm text-green-700/70 dark:text-green-500/80">Dakshina Karnataka Muslim Ookota — Membership Registration</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => { if (i < step) { setShowValidation(false); setStep(i); } }}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === step ? "bg-green-800 text-white shadow-sm"
                  : i < step ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 cursor-pointer hover:bg-green-200"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500"
                }`}
              >
                <span className="h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold border border-current">{i + 1}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className="h-px w-4 bg-slate-300 dark:bg-slate-700 flex-shrink-0" />}
            </div>
          ))}
        </div>
        <p className="text-xs text-green-700/60 dark:text-green-600/60 mt-1.5">{STEPS[step]?.desc} — Fields marked * are mandatory</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl mx-auto space-y-6">

          {/* ── Why Join DKMO? benefits ── */}
          {step === 0 && (
            <Card className="rounded-2xl border-green-200/70 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-white dark:from-green-950/30 dark:to-slate-900 shadow-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-green-900 dark:text-green-100">Why Join DKMO?</CardTitle>
                <CardDescription className="dark:text-slate-400">
                  Your membership unlocks a network of community welfare support for you and your family.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                {DKMO_BENEFITS.map((b) => {
                  const I = b.icon;
                  return (
                    <div key={b.title} className="flex items-start gap-3 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-green-100/80 dark:border-slate-700/60 p-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${b.tile}`}>
                        <I className={`h-4 w-4 ${b.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-green-950 dark:text-slate-100">{b.title}</p>
                        <p className="text-xs text-green-700/70 dark:text-slate-400 mt-0.5">{b.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ── Step 0: Personal Info ── */}
          {step === 0 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FieldRow label="Full Name *" id="fullName">
                    <Input id="fullName" value={form.fullName} onChange={(e) => set("fullName", e.target.value)}
                      className={inputClass(errCls(showValidation && !!stepErrors.fullName))}
                      placeholder="As in passport" />
                    {showValidation && stepErrors.fullName && <p className="text-xs text-red-500 mt-1">{stepErrors.fullName}</p>}
                  </FieldRow>
                </div>

                <FieldRow label="Date of Birth *" id="dob">
                  <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.dateOfBirth))} />
                  {showValidation && stepErrors.dateOfBirth && <p className="text-xs text-red-500 mt-1">{stepErrors.dateOfBirth}</p>}
                </FieldRow>

                <FieldRow label="Blood Group">
                  <Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}>
                    <SelectTrigger className={inputClass()}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Marital Status">
                  <Select value={form.maritalStatus} onValueChange={(v) => set("maritalStatus", v)}>
                    <SelectTrigger className={inputClass()}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{MARITAL_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Is family living in Saudi?">
                  <Select value={form.familyInSaudi} onValueChange={(v) => set("familyInSaudi", v)}>
                    <SelectTrigger className={inputClass()}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Passport Number *" id="passport">
                  <Input id="passport" value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.passportNumber))} placeholder="e.g. J1234567" />
                  {showValidation && stepErrors.passportNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.passportNumber}</p>}
                </FieldRow>

                <FieldRow label="Iqama / Residence ID * (10 digits)" id="iqama">
                  <Input id="iqama" value={form.iqamaNumber} onChange={(e) => set("iqamaNumber", e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className={inputClass(errCls(showValidation && !!stepErrors.iqamaNumber))} placeholder="10-digit number" maxLength={10} />
                  {showValidation && stepErrors.iqamaNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.iqamaNumber}</p>}
                </FieldRow>

                <FieldRow label="Occupation / Job Title *" id="occ">
                  <Input id="occ" value={form.occupation} onChange={(e) => set("occupation", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.occupation))} placeholder="e.g. Engineer" />
                  {showValidation && stepErrors.occupation && <p className="text-xs text-red-500 mt-1">{stepErrors.occupation}</p>}
                </FieldRow>

                <FieldRow label="Company / Employer" id="company">
                  <Input id="company" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} className={inputClass()} placeholder="Company name" />
                </FieldRow>

                {/* Reference Member */}
                <div className="sm:col-span-2">
                  <FieldRow label="Reference Member * — Who referred you to join DKMO?">
                    <MemberPicker value={refMember} error={showValidation && !!stepErrors.refMember} onChange={(m) => {
                      setRefMember(m);
                      if (m) { set("refMemberName", m.fullName); set("refMemberId", m.membershipId); }
                      else { set("refMemberName", ""); set("refMemberId", ""); }
                    }} />
                    {showValidation && stepErrors.refMember
                      ? <p className="text-xs text-red-500 mt-1">{stepErrors.refMember}</p>
                      : <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Required — select the DKMO member who referred you</p>}
                  </FieldRow>
                </div>

                {/* Passport Photo */}
                <div className="sm:col-span-2 pt-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-300 mb-2">Passport-size Photo (optional)</p>
                  <div className="flex items-start gap-4">
                    <div className="border-2 border-dashed border-green-300 dark:border-green-800 rounded-lg overflow-hidden flex-shrink-0 bg-amber-50 dark:bg-slate-800 flex items-center justify-center" style={{ width: 90, height: 112 }}>
                      {form.photoDataUrl
                        ? <img src={form.photoDataUrl} alt="Passport photo" className="w-full h-full object-cover" />
                        : <span className="text-xs text-slate-400 text-center px-1">Photo</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className={`inline-flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-green-800 dark:text-green-300 transition-colors ${photoProcessing ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-green-50 dark:hover:bg-slate-700"}`}>
                        {photoProcessing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</> : "Choose Photo"}
                        <input type="file" accept="image/*" className="hidden" disabled={photoProcessing} onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setPhotoError(null);
                          if (!file.type.startsWith("image/")) {
                            setPhotoError("Please choose an image file (JPG or PNG).");
                            return;
                          }
                          if (file.size > MAX_PHOTO_BYTES) {
                            setPhotoError("Photo size exceeds the 5MB limit. Please choose a smaller image.");
                            return;
                          }
                          setPhotoProcessing(true);
                          try {
                            const compressed = await compressImage(file);
                            set("photoDataUrl", compressed);
                          } catch (err) {
                            setPhotoError(err instanceof Error ? err.message : "Could not process that image. Please try another.");
                          } finally {
                            setPhotoProcessing(false);
                          }
                        }} />
                      </label>
                      {form.photoDataUrl && (
                        <button type="button" onClick={() => { set("photoDataUrl", ""); setPhotoError(null); }} className="block text-xs text-red-500 hover:text-red-700">Remove photo</button>
                      )}
                      {photoError
                        ? <p className="text-xs text-red-500">{photoError}</p>
                        : <p className="text-xs text-slate-400 dark:text-slate-500">JPG or PNG, max 5MB — photos are automatically resized.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 1: Saudi Contact ── */}
          {step === 1 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Contact Details in Saudi Arabia</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FieldRow label="Mobile Number * (Saudi)" id="mobileSaudi">
                  <Input id="mobileSaudi" value={form.mobileSaudi} onChange={(e) => set("mobileSaudi", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.mobileSaudi))} placeholder="e.g. 0501234567" />
                  {showValidation && stepErrors.mobileSaudi && <p className="text-xs text-red-500 mt-1">{stepErrors.mobileSaudi}</p>}
                </FieldRow>

                <FieldRow label="Email Address *" id="email">
                  <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.email))} placeholder="example@gmail.com" />
                  {showValidation && stepErrors.email && <p className="text-xs text-red-500 mt-1">{stepErrors.email}</p>}
                </FieldRow>

                <div className="sm:col-span-2">
                  <FieldRow label="Area / Location in Saudi">
                    <Input value={form.areaSaudi} onChange={(e) => set("areaSaudi", e.target.value)} className={inputClass()} placeholder="Area / Location" />
                  </FieldRow>
                </div>

                <FieldRow label="P.O. Box No. & Pin Code">
                  <Input value={form.poBox} onChange={(e) => set("poBox", e.target.value)} className={inputClass()} placeholder="P.O. Box" />
                </FieldRow>

                <FieldRow label="Business / Office Phone">
                  <Input value={form.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} className={inputClass()} placeholder="Business phone" />
                </FieldRow>

                <FieldRow label="Emergency Contact Name (Saudi)">
                  <Input value={form.emergencyNameSaudi} onChange={(e) => set("emergencyNameSaudi", e.target.value)} className={inputClass()} placeholder="Emergency contact name" />
                </FieldRow>

                <FieldRow label="Emergency Contact Mobile (Saudi)">
                  <Input value={form.emergencyMobileSaudi} onChange={(e) => set("emergencyMobileSaudi", e.target.value)} className={inputClass()} placeholder="Emergency mobile" />
                </FieldRow>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: India Contact ── */}
          {step === 2 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Contact Details in India</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FieldRow label="Name of Home / House *" id="houseName">
                    <Input id="houseName" value={form.houseName} onChange={(e) => set("houseName", e.target.value)}
                      className={inputClass(errCls(showValidation && !!stepErrors.houseName))} placeholder="House / Home name" />
                    {showValidation && stepErrors.houseName && <p className="text-xs text-red-500 mt-1">{stepErrors.houseName}</p>}
                  </FieldRow>
                </div>

                <div className="sm:col-span-2">
                  <FieldRow label="Postal Address">
                    <Input value={form.postalAddress} onChange={(e) => set("postalAddress", e.target.value)} className={inputClass()} placeholder="Full postal address" />
                  </FieldRow>
                </div>

                <FieldRow label="District">
                  <Input value={form.district} onChange={(e) => set("district", e.target.value)} className={inputClass()} placeholder="District" />
                </FieldRow>

                <FieldRow label="Nearest Jama'at">
                  <Input value={form.nearestJamaath} onChange={(e) => set("nearestJamaath", e.target.value)} className={inputClass()} placeholder="Nearest Jama'at" />
                </FieldRow>

                <FieldRow label="Home Phone * (India)" id="homePhone">
                  <Input id="homePhone" value={form.homePhone} onChange={(e) => set("homePhone", e.target.value)}
                    className={inputClass(errCls(showValidation && !!stepErrors.homePhone))} placeholder="Home landline / mobile" />
                  {showValidation && stepErrors.homePhone && <p className="text-xs text-red-500 mt-1">{stepErrors.homePhone}</p>}
                </FieldRow>

                <FieldRow label="Mobile Number (India — 10 digits)" id="mobileIndia">
                  <Input id="mobileIndia" value={form.mobileIndia} onChange={(e) => set("mobileIndia", e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className={inputClass(errCls(showValidation && !!stepErrors.mobileIndia))} placeholder="10-digit mobile (optional)" maxLength={10} />
                  {showValidation && stepErrors.mobileIndia && <p className="text-xs text-red-500 mt-1">{stepErrors.mobileIndia}</p>}
                </FieldRow>

                <FieldRow label="Emergency Contact Name (India)">
                  <Input value={form.emergencyNameIndia} onChange={(e) => set("emergencyNameIndia", e.target.value)} className={inputClass()} placeholder="Emergency contact name" />
                </FieldRow>

                <FieldRow label="Emergency Contact Mobile (India)">
                  <Input value={form.emergencyMobileIndia} onChange={(e) => set("emergencyMobileIndia", e.target.value)} className={inputClass()} placeholder="Emergency mobile" />
                </FieldRow>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Dependants & Notes ── */}
          {step === 3 && (
            <>
              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base text-green-900 dark:text-green-100">Dependants Details</CardTitle>
                      <CardDescription className="dark:text-slate-400">Family members accompanying you</CardDescription>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addDependent}
                      className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-1" disabled={dependents.length >= 7}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {dependents.length === 0 ? (
                    <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No dependants added. Click "Add" to add family members.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dependents.map((dep, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl bg-green-50/40 dark:bg-slate-800/50 border border-green-100 dark:border-slate-700">
                          <div className="col-span-5">
                            <Label className="text-xs text-green-900 dark:text-green-400 mb-1 block">Name *</Label>
                            <Input value={dep.fullName} onChange={(e) => setDependent(i, "fullName", e.target.value)} className={inputClass()} placeholder="Full name" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-green-900 dark:text-green-400 mb-1 block">Age</Label>
                            <Input type="number" min={0} max={99} value={dep.age} onChange={(e) => setDependent(i, "age", e.target.value)} className={inputClass()} placeholder="Age" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-green-900 dark:text-green-400 mb-1 block">Relationship</Label>
                            <Input value={dep.relation} onChange={(e) => setDependent(i, "relation", e.target.value)} className={inputClass()} placeholder="e.g. Son" />
                          </div>
                          <div className="col-span-1 pt-6 flex justify-center">
                            <button type="button" onClick={() => removeDependent(i)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardContent className="pt-4 space-y-4">
                  <FieldRow label="Any other details / notes">
                    <Textarea className={inputClass()} value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                      placeholder="Any additional information…" />
                  </FieldRow>

                  {/* Terms & Conditions */}
                  <div className="rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50/40 dark:bg-green-950/10 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5 text-green-700 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-900 dark:text-green-300">Terms &amp; Conditions</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Please read and accept the DKMO Terms &amp; Conditions before submitting your application.
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${basePath}/dkmo-terms`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View DKMO Terms &amp; Conditions
                    </a>
                    <div className="flex items-start gap-3 pt-1">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(v) => setTermsAccepted(Boolean(v))}
                        className="mt-0.5 border-green-600 data-[state=checked]:bg-green-700"
                      />
                      <label htmlFor="terms" className="text-sm text-green-900 dark:text-green-200 leading-relaxed cursor-pointer">
                        I have read and understood the DKMO Terms &amp; Conditions and agree to abide by them. I confirm that the information provided above is accurate and complete.
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {error && (
            <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pb-8">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}
                className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <a href={`${basePath}/login`} className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400 hover:underline">
                ← Portal Login
              </a>
            )}

            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext} className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting || photoProcessing || !termsAccepted}
                className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-2">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit Application"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
