import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  CheckCircle, Users, Loader2, ShieldCheck, ChevronRight, ChevronLeft,
  Plus, Trash2, Download, Printer, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from "wouter";
import jsPDF from "jspdf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Dependent {
  fullName: string;
  relation: string;
  age: string;
}

interface FormData {
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  maritalStatus: string;
  passportNumber: string;
  iqamaNumber: string;
  occupation: string;
  companyName: string;
  familyInSaudi: string;
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
  nomineeName: string;
  nomineeRelation: string;
  nomineeMobile: string;
  notes: string;
  photoDataUrl: string;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const MARITAL_STATUS = ["Single", "Married", "Widowed", "Divorced"];

const STEPS = [
  { label: "Personal Info",      desc: "Basic details & identification" },
  { label: "Saudi Contact",      desc: "Saudi Arabia contact & work info" },
  { label: "India Contact",      desc: "Home address & contacts" },
  { label: "Nominee & Dependents", desc: "Nominee, family members & T&C" },
];

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

// ─── PDF Generation ──────────────────────────────────────────────────────────
async function generateFrfPdf(
  form: FormData,
  dependents: Dependent[],
  frfNumber: string,
  submissionDate: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const mL = 12;
  const mR = 198;
  const cW = mR - mL; // 186mm
  const black: [number, number, number] = [0, 0, 0];
  const red: [number, number, number] = [180, 20, 20];
  const grey: [number, number, number] = [80, 80, 80];
  const lgrey: [number, number, number] = [160, 160, 160];

  // ── Load logo ──────────────────────────────────────────────────────────────
  let logoDataUrl: string | null = null;
  try {
    const resp = await fetch(`${basePath}/logo.png`);
    const blob = await resp.blob();
    logoDataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  } catch { /* logo fails gracefully */ }

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // Logo top-left
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", mL, 8, 24, 24);
  } else {
    doc.setDrawColor(...black);
    doc.setLineWidth(0.4);
    doc.rect(mL, 8, 24, 24);
    doc.setTextColor(...grey);
    doc.setFontSize(6);
    doc.text("DKMO", mL + 12, 22, { align: "center" });
  }

  // Title (centered on page)
  doc.setTextColor(...black);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("DAKSHINA KARNATAKA MUSLIM OKKOOTA", PW / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Family Relief Fund (FRF) Application Form", PW / 2, 24, { align: "center" });

  // FRF ID box (top-right)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("FRF ID No.", 153, 11);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(153, 13, 45, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(frfNumber, 175, 19.5, { align: "center" });

  // Separator
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.line(mL, 34, mR, 34);

  // ── IMPORTANT NOTE ─────────────────────────────────────────────────────────
  let y = 39;
  doc.setTextColor(...red);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Important Note:", mL, y);
  y += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const noteLines = doc.splitTextToSize(
    "In Case of any changes in your Contact Information, You have to inform to the General Secretary of DKMO Immediately.",
    cW - 2,
  );
  doc.text(noteLines, mL, y);
  y += noteLines.length * 4.2 + 3;

  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mR, y);
  y += 6;

  // ── PERSONAL INFO + PHOTO BOX ───────────────────────────────────────────────
  // Photo box (passport size, right side)
  const photoX = 168;
  const photoY = y;
  const photoW = 30;
  const photoH = 38;
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(photoX, photoY, photoW, photoH);

  if (form.photoDataUrl) {
    try {
      doc.addImage(form.photoDataUrl, "JPEG", photoX + 0.5, photoY + 0.5, photoW - 1, photoH - 1);
    } catch { /* skip */ }
  } else {
    doc.setFillColor(255, 235, 80);
    doc.rect(photoX + 0.5, photoY + 0.5, photoW - 1, photoH - 1, "F");
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Affix Passport", photoX + photoW / 2, photoY + photoH / 2 - 2, { align: "center" });
    doc.text("size Photo", photoX + photoW / 2, photoY + photoH / 2 + 3, { align: "center" });
  }

  // Field helper (underline style)
  const fw = photoX - mL - 3; // width left of photo
  const fw2 = (fw - 3) / 2;  // half of that
  const fullW = cW;
  const fullW2 = (cW - 3) / 2;

  const drawLine = (x: number, fy: number, w: number) => {
    doc.setDrawColor(...lgrey);
    doc.setLineWidth(0.3);
    doc.line(x, fy, x + w, fy);
  };
  const pField = (label: string, value: string, x: number, w: number, fy: number) => {
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x, fy);
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (value) doc.text(value, x + 1, fy + 5.5, { maxWidth: w - 2 });
    drawLine(x, fy + 8, w);
  };

  // Row 1 (left of photo): Full Name full width
  pField("Full Name of the Applicant", form.fullName, mL, fw, y);
  y += 11;

  // Row 2: Date of Birth | Passport No.
  pField("Date of Birth", form.dateOfBirth, mL, fw2, y);
  pField("Passport No.", form.passportNumber, mL + fw2 + 3, fw2, y);
  y += 11;

  // Row 3: Occupation | Iqama No.
  pField("Occupation / Job Title", form.occupation, mL, fw2, y);
  pField("Iqama No.", form.iqamaNumber, mL + fw2 + 3, fw2, y);
  y += 11;

  // Row 4: Company (full content width, photo box ends below this)
  pField("Company / Employer Name", form.companyName, mL, fw, y);
  y += 11;

  // Now past photo box — use full width
  pField("Marital Status (single / married)", form.maritalStatus, mL, fullW2, y);
  pField("Number of Dependents", String(dependents.length), mL + fullW2 + 3, fullW2, y);
  y += 11;

  pField("Is the family living in Saudi (Yes / No)", form.familyInSaudi || "", mL, fullW2, y);
  pField("Blood Group", form.bloodGroup, mL + fullW2 + 3, fullW2, y);
  y += 14;

  // ── CONTACT DETAILS (two bordered boxes side by side) ──────────────────────
  const boxW = cW / 2;     // 93mm each
  const boxL = mL;
  const boxR = mL + boxW;
  const rowH = 9;
  const contactData = [
    { l: "Area / Location you located",                            lv: form.areaSaudi,
      r: "Name of Home/House",                                     rv: form.houseName },
    { l: "P.O. Box No. & Pin Code No.",                           lv: form.poBox,
      r: "Postal details",                                         rv: form.postalAddress },
    { l: "Business Tel. No.",                                      lv: form.businessPhone,
      r: "District Name and nearest Jaina't",                      rv: [form.district, form.nearestJamaath].filter(Boolean).join(" / ") },
    { l: "Mobile No.",                                             lv: form.mobileSaudi,
      r: "Home Tel. No.",                                          rv: form.homePhone },
    { l: "Email ID",                                               lv: form.email,
      r: "Mobile No.",                                             rv: form.mobileIndia },
    { l: "Contact person's name & mobile no. in case of emergency", lv: [form.emergencyNameSaudi, form.emergencyMobileSaudi].filter(Boolean).join(" — "),
      r: "Contact person's name & mobile no. in case of emergency", rv: [form.emergencyNameIndia, form.emergencyMobileIndia].filter(Boolean).join(" — ") },
  ];
  const hdrH = 8;
  const totalBoxH = hdrH + contactData.length * rowH;

  // Draw outer borders
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(boxL, y, boxW, totalBoxH);
  doc.rect(boxR, y, boxW, totalBoxH);

  // Headers (bold, centered)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Contact details in Saudi Arabia", boxL + boxW / 2, y + 5.5, { align: "center" });
  doc.text("Contact details in India", boxR + boxW / 2, y + 5.5, { align: "center" });

  // Header bottom lines
  doc.setLineWidth(0.4);
  doc.line(boxL, y + hdrH, boxL + boxW, y + hdrH);
  doc.line(boxR, y + hdrH, boxR + boxW, y + hdrH);

  let cy = y + hdrH;
  for (let i = 0; i < contactData.length; i++) {
    const row = contactData[i];

    // Left cell
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(row.l, boxL + 2, cy + 3.5, { maxWidth: boxW - 4 });
    if (row.lv) {
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(row.lv, boxL + 2, cy + 7.5, { maxWidth: boxW - 4 });
    }

    // Right cell
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(row.r, boxR + 2, cy + 3.5, { maxWidth: boxW - 4 });
    if (row.rv) {
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(row.rv, boxR + 2, cy + 7.5, { maxWidth: boxW - 4 });
    }

    cy += rowH;
    if (i < contactData.length - 1) {
      doc.setLineWidth(0.2);
      doc.setDrawColor(...lgrey);
      doc.line(boxL + 0.5, cy, boxL + boxW - 0.5, cy);
      doc.line(boxR + 0.5, cy, boxR + boxW - 0.5, cy);
    }
  }
  y += totalBoxH + 5;

  // ── DEPENDANTS TABLE ────────────────────────────────────────────────────────
  const depHdrH = 6;
  const depColHdrH = 6;
  const depRowH = 6;
  const depRowCount = 7;
  const depTotalH = depHdrH + depColHdrH + depRowCount * depRowH;

  const nameW = cW * 0.58;
  const ageW  = cW * 0.18;
  const relW  = cW * 0.24;

  // Outer border
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(mL, y, cW, depTotalH);

  // "Dependants details" section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...black);
  doc.text("Dependants details", mL + 2, y + 4.5);

  // Section header line
  doc.setLineWidth(0.4);
  doc.line(mL, y + depHdrH, mR, y + depHdrH);

  let dy = y + depHdrH;

  // Column headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Name", mL + 2, dy + 4.2);
  doc.text("Age", mL + nameW + ageW / 2, dy + 4.2, { align: "center" });
  doc.text("Relationship", mL + nameW + ageW + relW / 2, dy + 4.2, { align: "center" });

  // Vertical separators
  doc.setLineWidth(0.3);
  doc.setDrawColor(...black);
  doc.line(mL + nameW, y + depHdrH, mL + nameW, y + depTotalH);
  doc.line(mL + nameW + ageW, y + depHdrH, mL + nameW + ageW, y + depTotalH);

  dy += depColHdrH;
  doc.setLineWidth(0.3);
  doc.line(mL, dy, mR, dy);

  for (let i = 0; i < depRowCount; i++) {
    const dep = dependents[i] ?? null;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(`${i + 1})`, mL + 1.5, dy + 4.2);
    if (dep?.fullName) doc.text(dep.fullName, mL + 6, dy + 4.2, { maxWidth: nameW - 8 });
    const ageText = dep?.age ? `( ${dep.age} )` : "(          )";
    const relText = dep?.relation ? `{ ${dep.relation} }` : "{                    }";
    doc.text(ageText, mL + nameW + ageW / 2, dy + 4.2, { align: "center" });
    doc.text(relText, mL + nameW + ageW + relW / 2, dy + 4.2, { align: "center" });
    dy += depRowH;
    if (i < depRowCount - 1) {
      doc.setLineWidth(0.15);
      doc.setDrawColor(...lgrey);
      doc.line(mL + 0.5, dy, mR - 0.5, dy);
    }
  }
  y += depTotalH + 5;

  // ── ANY OTHER DETAILS ───────────────────────────────────────────────────────
  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Any other details, if any", mL, y);
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text("(If you are not willing to avail contribution, please mention so herein)", mL, y);
  y += 5;
  if (form.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(form.notes, mL, y, { maxWidth: cW });
    y += 5;
  }
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.3);
  doc.line(mL, y, mR, y);
  y += 3;

  // Submission date (small, right-aligned)
  doc.setTextColor(...grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Submitted: ${submissionDate}`, mR, y, { align: "right" });

  // ── SIGNATURES ──────────────────────────────────────────────────────────────
  y = Math.max(y + 8, 273);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mL + 68, y);
  doc.line(mR - 78, y, mR, y);
  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Applicant's Signature & date", mL, y + 4.5);
  doc.text("Signature of President/ General Secretary-OKMO", mR - 78, y + 4.5);

  doc.save(`FRF_Application_${frfNumber}.pdf`);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function FrfApplyPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitted, setSubmitted] = useState<{
    frfNumber: string;
    fullName: string;
    submittedAt: string;
    formData: FormData;
    dependents: Dependent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    fullName: "", dateOfBirth: "", bloodGroup: "", maritalStatus: "",
    passportNumber: "", iqamaNumber: "", occupation: "", companyName: "",
    familyInSaudi: "", mobileSaudi: "", email: "", areaSaudi: "", poBox: "", businessPhone: "",
    emergencyNameSaudi: "", emergencyMobileSaudi: "",
    houseName: "", postalAddress: "", district: "", nearestJamaath: "",
    homePhone: "", mobileIndia: "", emergencyNameIndia: "", emergencyMobileIndia: "",
    nomineeName: "", nomineeRelation: "", nomineeMobile: "", notes: "",
    photoDataUrl: "",
  });

  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  const set = (field: keyof FormData, value: string) => setForm((f) => ({ ...f, [field]: value }));
  const addDependent = () => setDependents((d) => [...d, { fullName: "", relation: "", age: "" }]);
  const removeDependent = (i: number) => setDependents((d) => d.filter((_, idx) => idx !== i));
  const setDependent = (i: number, field: keyof Dependent, value: string) =>
    setDependents((d) => d.map((dep, idx) => (idx === i ? { ...dep, [field]: value } : dep)));

  // Per-step validation — returns a map of fieldKey → error message
  const getStepErrors = (): Record<string, string> => {
    if (step === 0) {
      const errs: Record<string, string> = {};
      if (!form.fullName.trim()) errs.fullName = "Full name is required.";
      return errs;
    }
    if (step === 1) {
      const errs: Record<string, string> = {};
      if (!form.mobileSaudi.trim()) errs.mobileSaudi = "Saudi mobile number is required.";
      return errs;
    }
    return {};
  };

  const stepErrors = getStepErrors();
  const canAdvance = () => Object.keys(stepErrors).length === 0;

  const handleNext = () => {
    setShowValidation(true);
    if (canAdvance()) {
      setShowValidation(false);
      setStep(step + 1);
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) { setError("Full name is required."); return; }
    if (!termsAccepted) { setError("You must accept the FRF Terms & Conditions before submitting."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        numDependents: dependents.length,
        dependents: dependents
          .filter((d) => d.fullName.trim())
          .map((d) => ({ fullName: d.fullName, relation: d.relation, age: d.age ? parseInt(d.age, 10) : null })),
      };
      const res = await fetch(`${basePath}/api/frf/memberships/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error || `Request failed (${res.status})`);
      }
      const data = await res.json() as { frfNumber: string; fullName: string };
      setSubmitted({
        frfNumber: data.frfNumber,
        fullName: data.fullName,
        submittedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        formData: { ...form },
        dependents: [...dependents],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success / Confirmation ──────────────────────────────────────────────────
  if (submitted) {
    const handleDownloadPdf = () => {
      void generateFrfPdf(submitted.formData, submitted.dependents, submitted.frfNumber, submitted.submittedAt);
    };
    const handlePrint = () => {
      void generateFrfPdf(submitted.formData, submitted.dependents, submitted.frfNumber, submitted.submittedAt);
    };

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>
        <Card className="w-full max-w-lg rounded-2xl border-green-200 dark:border-green-900/50 shadow-xl dark:bg-slate-900">
          <CardContent className="pt-10 pb-8 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-green-900 dark:text-green-100">Application Submitted!</h2>
              <p className="mt-1 text-sm text-green-700/70 dark:text-green-500/80">Thank you, {submitted.fullName}</p>
            </div>

            {/* FRF ID */}
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl px-6 py-4 w-full">
              <p className="text-xs text-green-700/70 dark:text-green-600 mb-1">Your FRF Application Number</p>
              <p className="text-3xl font-bold text-green-800 dark:text-green-300 tracking-wider">{submitted.frfNumber}</p>
              <p className="text-xs text-green-600/60 dark:text-green-700/60 mt-1">Please save this for future reference</p>
            </div>

            {/* Details */}
            <div className="w-full text-left space-y-1 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Applicant</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{submitted.fullName}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Submission Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{submitted.submittedAt}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Status</span>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                  Pending Approval
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your application is under review. You will be contacted at your provided mobile number once processed.
            </p>

            {/* PDF Buttons */}
            <div className="flex flex-col gap-2 w-full">
              <Button
                className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-2"
                onClick={handleDownloadPdf}
              >
                <Download className="h-4 w-4" />
                Download Application PDF
              </Button>
              <Button
                variant="outline"
                className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-2"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" />
                Print Application
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500 dark:text-slate-400 gap-1"
                onClick={() => setLocation(`${basePath}/frf-terms`)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Terms &amp; Conditions
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-1 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300"
              onClick={() => setLocation("/login")}
            >
              Back to Portal Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-8">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <img src={`${basePath}/logo.png`} alt="DKMO" className="h-12 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-green-900 dark:text-green-100">FRF Membership Application</h1>
            <p className="text-sm text-green-700/70 dark:text-green-500/80">Dakshina Karnataka Muslim Ookota — Family Relief Fund</p>
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
                  i === step
                    ? "bg-green-800 text-white shadow-sm"
                    : i < step
                    ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 cursor-pointer hover:bg-green-200"
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
        <p className="text-xs text-green-700/60 dark:text-green-600/60 mt-1.5">{STEPS[step]?.desc}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Step 0: Personal Info */}
          {step === 0 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Personal Information</CardTitle>
                <CardDescription>Fields marked * are required</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FieldRow label="Full Name *" id="fullName">
                    <Input
                      id="fullName"
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      className={inputClass(showValidation && stepErrors.fullName ? "border-red-400 dark:border-red-500" : "")}
                      placeholder="As in passport"
                    />
                    {showValidation && stepErrors.fullName && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1">{stepErrors.fullName}</p>
                    )}
                  </FieldRow>
                </div>
                <FieldRow label="Date of Birth" id="dob">
                  <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputClass()} />
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
                <FieldRow label="Passport Number" id="passport">
                  <Input id="passport" value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value)} className={inputClass()} placeholder="e.g. J1234567" />
                </FieldRow>
                <FieldRow label="Iqama / Residence ID" id="iqama">
                  <Input id="iqama" value={form.iqamaNumber} onChange={(e) => set("iqamaNumber", e.target.value)} className={inputClass()} placeholder="Iqama number" />
                </FieldRow>
                <FieldRow label="Occupation" id="occ">
                  <Input id="occ" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} className={inputClass()} placeholder="e.g. Engineer" />
                </FieldRow>
                <FieldRow label="Company / Employer" id="company">
                  <Input id="company" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} className={inputClass()} placeholder="Company name" />
                </FieldRow>

                {/* Passport Photo Upload */}
                <div className="sm:col-span-2 pt-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-300 mb-2">Passport-size Photo (optional)</p>
                  <div className="flex items-start gap-4">
                    <div className="border-2 border-dashed border-green-300 dark:border-green-800 rounded-lg overflow-hidden flex-shrink-0"
                         style={{ width: 90, height: 112, background: "#fffbe6" }}>
                      {form.photoDataUrl
                        ? <img src={form.photoDataUrl} alt="Passport photo" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 gap-1 p-2 text-center">
                            <span>Affix Passport</span>
                            <span>Size Photo</span>
                          </div>
                      }
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="photoUpload"
                        className="cursor-pointer inline-flex items-center gap-2 text-sm text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded-lg px-3 py-2 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors">
                        <span>Choose photo…</span>
                      </label>
                      <input id="photoUpload" type="file" accept="image/*" className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onloadend = () => set("photoDataUrl", reader.result as string);
                          reader.readAsDataURL(file);
                        }} />
                      {form.photoDataUrl && (
                        <button type="button" onClick={() => set("photoDataUrl", "")}
                          className="text-xs text-red-500 hover:text-red-700 block">Remove photo</button>
                      )}
                      <p className="text-xs text-slate-400">Will appear in the downloaded PDF form.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Saudi Contact */}
          {step === 1 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Saudi Arabia Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FieldRow label="Mobile (Saudi) *" id="mobSA">
                  <Input
                    id="mobSA"
                    value={form.mobileSaudi}
                    onChange={(e) => set("mobileSaudi", e.target.value)}
                    className={inputClass(showValidation && stepErrors.mobileSaudi ? "border-red-400 dark:border-red-500" : "")}
                    placeholder="+966 5x xxx xxxx"
                  />
                  {showValidation && stepErrors.mobileSaudi && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{stepErrors.mobileSaudi}</p>
                  )}
                </FieldRow>
                <FieldRow label="Is the family living in Saudi?" id="famSaudi">
                  <Select value={form.familyInSaudi} onValueChange={(v) => set("familyInSaudi", v)}>
                    <SelectTrigger className={inputClass()}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Email" id="email">
                  <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass()} placeholder="email@example.com" />
                </FieldRow>
                <FieldRow label="Area / City (Saudi)" id="areaSA">
                  <Input id="areaSA" value={form.areaSaudi} onChange={(e) => set("areaSaudi", e.target.value)} className={inputClass()} placeholder="e.g. Riyadh" />
                </FieldRow>
                <FieldRow label="P.O. Box" id="poBox">
                  <Input id="poBox" value={form.poBox} onChange={(e) => set("poBox", e.target.value)} className={inputClass()} />
                </FieldRow>
                <FieldRow label="Business Phone" id="bizPhone">
                  <Input id="bizPhone" value={form.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} className={inputClass()} />
                </FieldRow>
                <div className="sm:col-span-2"><Separator /></div>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-300 mb-3">Emergency Contact in Saudi</p>
                </div>
                <FieldRow label="Emergency Contact Name" id="emgNameSA">
                  <Input id="emgNameSA" value={form.emergencyNameSaudi} onChange={(e) => set("emergencyNameSaudi", e.target.value)} className={inputClass()} />
                </FieldRow>
                <FieldRow label="Emergency Mobile (Saudi)" id="emgMobSA">
                  <Input id="emgMobSA" value={form.emergencyMobileSaudi} onChange={(e) => set("emergencyMobileSaudi", e.target.value)} className={inputClass()} />
                </FieldRow>
              </CardContent>
            </Card>
          )}

          {/* Step 2: India Contact */}
          {step === 2 && (
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-green-900 dark:text-green-100">Home Address (India / Karnataka)</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <FieldRow label="House Name" id="houseName">
                  <Input id="houseName" value={form.houseName} onChange={(e) => set("houseName", e.target.value)} className={inputClass()} />
                </FieldRow>
                <FieldRow label="Postal Address" id="postalAddr">
                  <Input id="postalAddr" value={form.postalAddress} onChange={(e) => set("postalAddress", e.target.value)} className={inputClass()} placeholder="Street / Post" />
                </FieldRow>
                <FieldRow label="District" id="district">
                  <Input id="district" value={form.district} onChange={(e) => set("district", e.target.value)} className={inputClass()} placeholder="e.g. Dakshina Kannada" />
                </FieldRow>
                <FieldRow label="Nearest Jamaath" id="jamaath">
                  <Input id="jamaath" value={form.nearestJamaath} onChange={(e) => set("nearestJamaath", e.target.value)} className={inputClass()} />
                </FieldRow>
                <FieldRow label="Home Phone (India)" id="homePhone">
                  <Input id="homePhone" value={form.homePhone} onChange={(e) => set("homePhone", e.target.value)} className={inputClass()} placeholder="+91 xxx xxx xxxx" />
                </FieldRow>
                <FieldRow label="Mobile (India)" id="mobIndia">
                  <Input id="mobIndia" value={form.mobileIndia} onChange={(e) => set("mobileIndia", e.target.value)} className={inputClass()} placeholder="+91 9xx xxx xxxx" />
                </FieldRow>
                <div className="sm:col-span-2"><Separator /></div>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-300 mb-3">Emergency Contact in India</p>
                </div>
                <FieldRow label="Emergency Contact Name" id="emgNameIN">
                  <Input id="emgNameIN" value={form.emergencyNameIndia} onChange={(e) => set("emergencyNameIndia", e.target.value)} className={inputClass()} />
                </FieldRow>
                <FieldRow label="Emergency Mobile (India)" id="emgMobIN">
                  <Input id="emgMobIN" value={form.emergencyMobileIndia} onChange={(e) => set("emergencyMobileIndia", e.target.value)} className={inputClass()} />
                </FieldRow>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Nominee, Dependents & Terms */}
          {step === 3 && (
            <>
              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-green-900 dark:text-green-100">Nominee Information</CardTitle>
                  <CardDescription>Person to receive benefits in case of claim</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <FieldRow label="Nominee Name" id="nomName">
                    <Input id="nomName" value={form.nomineeName} onChange={(e) => set("nomineeName", e.target.value)} className={inputClass()} />
                  </FieldRow>
                  <FieldRow label="Relation to Applicant" id="nomRelation">
                    <Input id="nomRelation" value={form.nomineeRelation} onChange={(e) => set("nomineeRelation", e.target.value)} className={inputClass()} placeholder="e.g. Wife, Father" />
                  </FieldRow>
                  <FieldRow label="Nominee Mobile" id="nomMobile">
                    <Input id="nomMobile" value={form.nomineeMobile} onChange={(e) => set("nomineeMobile", e.target.value)} className={inputClass()} />
                  </FieldRow>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-green-900 dark:text-green-100">Dependents</CardTitle>
                    <CardDescription>Family members covered under FRF membership</CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addDependent}
                    className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dependents.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-500 text-center py-4">No dependents added yet</p>
                  ) : (
                    dependents.map((dep, i) => (
                      <div key={i} className="grid sm:grid-cols-3 gap-3 p-3 rounded-xl border border-green-100 dark:border-slate-700 bg-green-50/30 dark:bg-slate-800/30">
                        <Input value={dep.fullName} onChange={(e) => setDependent(i, "fullName", e.target.value)}
                          className={inputClass()} placeholder="Full name" />
                        <Input value={dep.relation} onChange={(e) => setDependent(i, "relation", e.target.value)}
                          className={inputClass()} placeholder="Relation (e.g. Spouse)" />
                        <div className="flex gap-2">
                          <Input value={dep.age} onChange={(e) => setDependent(i, "age", e.target.value)}
                            type="number" min="0" max="99" className={inputClass("flex-1")} placeholder="Age" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeDependent(i)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-green-900 dark:text-green-100">Additional Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
                    className={inputClass()} placeholder="Any additional information..." rows={3} />
                </CardContent>
              </Card>

              {/* Terms & Conditions */}
              <Card className="rounded-2xl border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 shadow-sm">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-3 mb-4">
                    <ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Terms &amp; Conditions</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-500 mt-0.5">
                        Please read and accept the FRF Terms &amp; Conditions before submitting your application.
                      </p>
                    </div>
                  </div>
                  <a
                    href={`${basePath}/frf-terms`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-green-800 dark:text-green-300 underline underline-offset-2 hover:text-green-600 mb-4"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View FRF Terms &amp; Conditions
                  </a>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(v) => setTermsAccepted(Boolean(v))}
                      className="mt-0.5"
                    />
                    <label htmlFor="terms" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer leading-relaxed">
                      I have read and understood the FRF Terms &amp; Conditions and agree to abide by them. I confirm that the information provided above is accurate and complete.
                    </label>
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
          <div className="flex justify-between items-center pb-4">
            <Button type="button" variant="outline"
              className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300"
              onClick={() => {
                setShowValidation(false);
                step > 0 ? setStep(step - 1) : setLocation("/login");
              }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step === 0 ? "Back to Login" : "Previous"}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button type="button"
                className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
                onClick={handleNext}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="submit"
                className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
                disabled={submitting || !termsAccepted}
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Submit Application"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
