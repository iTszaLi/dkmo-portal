import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { Receipt, Download, Printer, RotateCcw, FolderOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCreateReceiptRecord } from "@workspace/api-client-react";

const schema = z.object({
  receiptDate: z.string().min(1, "Date is required"),
  receiptNumber: z.string().min(1, "Receipt number is required"),
  jamathName: z.string().default(""),
  memberName: z.string().min(1, "Name is required"),
  dkmoId: z.string().default(""),
  mobileNumber: z.string().default(""),
  whatsappNumber: z.string().default(""),
  paymentTypes: z.object({
    lifeMembership: z.boolean().default(false),
    frfCase: z.string().default(""),
    voluntaryYearly: z.boolean().default(false),
    donation: z.boolean().default(false),
    loanRecovery: z.boolean().default(false),
    others: z.boolean().default(false),
  }),
  amount: z.coerce.number().nonnegative("Amount must be ≥ 0"),
});
type FormValues = z.infer<typeof schema>;

// Load logo as base64 data URL for jsPDF
function loadLogoDataUrl(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("PNG"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

async function generateReceiptPdf(data: FormValues, basePath: string): Promise<jsPDF> {
  const logoDataUrl = await loadLogoDataUrl(`${basePath}/logo.png`);

  // A5 landscape: 210 x 148 mm
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const W = 210;
  const maroon: [number, number, number] = [100, 25, 10];
  const black: [number, number, number] = [0, 0, 0];
  const gray: [number, number, number] = [140, 140, 140];

  // ── HEADER ────────────────────────────────────────────────────────
  // Logo (top-left)
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 4, 3, 22, 22);
  }

  // Title
  doc.setTextColor(...maroon);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Dakshina Karnataka Muslim Okkoota - DKMO RIYADH", 30, 14, { baseline: "middle" });

  // Thin divider under header
  doc.setDrawColor(...maroon);
  doc.setLineWidth(0.6);
  doc.line(4, 27, W - 4, 27);

  // ── ROW 1: Date | Receipt # | Jamath Name ────────────────────────
  let y = 35;
  doc.setTextColor(...black);
  doc.setFontSize(9);

  // Date
  doc.setFont("helvetica", "bold");
  doc.text("Date:", 6, y);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(...gray);
  doc.setLineWidth(0.3);
  doc.line(18, y + 0.5, 60, y + 0.5);
  doc.text(data.receiptDate, 18, y - 0.5);

  // Receipt #
  doc.setFont("helvetica", "bold");
  doc.text("Receipt # :", 65, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.receiptNumber, 87, y - 0.5);
  doc.line(87, y + 0.5, 115, y + 0.5);

  // Jamath Name
  doc.setFont("helvetica", "bold");
  doc.text("Jamath Name:", 118, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.jamathName || "", 142, y - 0.5);
  doc.line(142, y + 0.5, W - 4, y + 0.5);

  // ── ROW 2: Name | DKMO ID ─────────────────────────────────────────
  y += 11;
  doc.setFont("helvetica", "bold");
  doc.text("Name :", 6, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.memberName, 20, y - 0.5);
  doc.line(20, y + 0.5, 106, y + 0.5);

  doc.setFont("helvetica", "bold");
  doc.text("DKMO ID # :", 110, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.dkmoId || "", 133, y - 0.5);
  doc.line(133, y + 0.5, W - 4, y + 0.5);

  // ── ROW 3: Mobile | WhatsApp ──────────────────────────────────────
  y += 11;
  doc.setFont("helvetica", "bold");
  doc.text("Mobile #:", 6, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.mobileNumber || "", 23, y - 0.5);
  doc.line(23, y + 0.5, 106, y + 0.5);

  doc.setFont("helvetica", "bold");
  doc.text("WhatsApp # :", 110, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.whatsappNumber || "", 134, y - 0.5);
  doc.line(134, y + 0.5, W - 4, y + 0.5);

  // ── ROW 4: Received Towards ───────────────────────────────────────
  y += 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Received", 6, y);
  doc.text("Towards:", 6, y + 5.5);

  const boxes = [
    { label: "Life Membership", checked: data.paymentTypes.lifeMembership },
    { label: `FRF Case#\n${data.paymentTypes.frfCase || ""}`, checked: !!data.paymentTypes.frfCase },
    { label: "Voluntary Yearly\nContribution", checked: data.paymentTypes.voluntaryYearly },
    { label: "Donation", checked: data.paymentTypes.donation },
    { label: "Loan\nRecovery", checked: data.paymentTypes.loanRecovery },
    { label: "Others", checked: data.paymentTypes.others },
  ];

  const bW = 26;
  const bH = 9;
  const startX = 24;
  const gap = 2;

  boxes.forEach((b, i) => {
    const bx = startX + i * (bW + gap);
    const by = y - 2;
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, by, bW, bH, 3, 3);
    if (b.checked) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text("✓", bx + bW / 2, by + bH / 2 + 1, { align: "center" });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(40, 40, 40);
    const lines = b.label.split("\n");
    lines.forEach((line, li) => {
      doc.text(line, bx + bW / 2, by + bH + 3.5 + li * 4, { align: "center" });
    });
  });

  // SR/= amount box (right of the boxes)
  const amtX = startX + 6 * (bW + gap) + 4;
  doc.setTextColor(...black);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SR/=", amtX, y + 2.5);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.rect(amtX + 9, y - 2, 22, 9);
  if (data.amount > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(String(data.amount), amtX + 20, y + 2.5, { align: "center" });
  }

  // ── DIVIDER ────────────────────────────────────────────────────────
  y += 22;
  doc.setDrawColor(...maroon);
  doc.setLineWidth(0.8);
  doc.line(4, y, W - 4, y);

  // ── COMMITTED TO THE COMMUNITY ────────────────────────────────────
  y += 6;
  doc.setTextColor(...maroon);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("COMMITTED TO THE COMMUNITY", W / 2, y, { align: "center" });

  y += 5;
  const leftItems = [
    "Frf Scheme (Family Relief Fund)",
    "Medical Aid",
    "Free Air Ticket To Stranded NRI's",
    "General Relief Fund",
  ];
  const rightItems = [
    "Representative In India For Health & Govt Scheme Utilization",
    "Emergency Response Scheme.",
    "Dkmo Job Bureau",
    "Loan Scheme For Members",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  leftItems.forEach((s, i) => {
    doc.text(`✦  ${s}`, 8, y + i * 6);
  });
  rightItems.forEach((s, i) => {
    doc.text(`✦  ${s}`, W / 2 + 4, y + i * 6);
  });

  // Signature
  const sigY = y + 25;
  doc.setDrawColor(...gray);
  doc.setLineWidth(0.3);
  doc.line(W - 56, sigY, W - 6, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Treasurer / Gen. Secretary", W - 31, sigY + 4, { align: "center" });

  return doc;
}

// ── LIVE RECEIPT PREVIEW COMPONENT ────────────────────────────────────
function ReceiptPreview({ data }: { data: FormValues }) {
  const maroon = "#64190A";
  const dotLine = "border-b border-dotted border-gray-500 inline-block flex-1 min-w-0";

  const boxes = [
    { label: ["Life Membership"], checked: data.paymentTypes.lifeMembership },
    { label: ["FRF Case#", data.paymentTypes.frfCase || ""], checked: !!data.paymentTypes.frfCase },
    { label: ["Voluntary Yearly", "Contribution"], checked: data.paymentTypes.voluntaryYearly },
    { label: ["Donation"], checked: data.paymentTypes.donation },
    { label: ["Loan", "Recovery"], checked: data.paymentTypes.loanRecovery },
    { label: ["Others"], checked: data.paymentTypes.others },
  ];

  return (
    <div
      className="receipt-preview bg-white text-black font-sans"
      style={{
        width: "700px",
        minHeight: "394px",
        border: "1px solid #ccc",
        padding: "14px 16px 12px",
        fontSize: "12px",
        lineHeight: "1.4",
        boxSizing: "border-box",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <img
          src="/logo.png"
          alt="DKMO"
          style={{ width: "60px", height: "60px", objectFit: "contain", flexShrink: 0 }}
        />
        <div style={{ color: maroon, fontWeight: "bold", fontSize: "20px", lineHeight: "1.2" }}>
          Dakshina Karnataka Muslim Okkoota - DKMO RIYADH
        </div>
      </div>

      {/* Header divider */}
      <div style={{ borderTop: `2px solid ${maroon}`, marginBottom: "10px" }} />

      {/* ROW 1: Date | Receipt # | Jamath Name */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", minWidth: "170px" }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Date:</span>
          <span className={dotLine} style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px" }}>
            {data.receiptDate}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", minWidth: "140px" }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Receipt # :</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, minWidth: "60px", marginBottom: "1px", paddingLeft: "4px" }}>
            {data.receiptNumber}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flex: 1 }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Jamath Name:</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px", paddingLeft: "4px" }}>
            {data.jamathName}
          </span>
        </div>
      </div>

      {/* ROW 2: Name | DKMO ID */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flex: 1.5 }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Name :</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px", paddingLeft: "4px" }}>
            {data.memberName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flex: 1 }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>DKMO ID # :</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px", paddingLeft: "4px" }}>
            {data.dkmoId}
          </span>
        </div>
      </div>

      {/* ROW 3: Mobile | WhatsApp */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flex: 1.5 }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Mobile #:</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px", paddingLeft: "4px" }}>
            {data.mobileNumber}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flex: 1 }}>
          <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Whatsapp # :</span>
          <span style={{ borderBottom: "1px dotted #777", flex: 1, marginBottom: "1px", paddingLeft: "4px" }}>
            {data.whatsappNumber}
          </span>
        </div>
      </div>

      {/* ROW 4: Received Towards + boxes + SR amount */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", whiteSpace: "nowrap", lineHeight: "1.3", paddingTop: "2px" }}>
          Received<br />Towards:
        </div>
        <div style={{ display: "flex", gap: "5px", flexWrap: "nowrap", flex: 1 }}>
          {boxes.map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "72px" }}>
              <div style={{
                width: "68px",
                height: "26px",
                border: "1.5px solid #444",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#000",
              }}>
                {b.checked ? "✓" : ""}
              </div>
              <div style={{ textAlign: "center", fontSize: "9.5px", marginTop: "3px", lineHeight: "1.2", maxWidth: "72px" }}>
                {b.label.map((l, li) => <div key={li}>{l}</div>)}
              </div>
            </div>
          ))}
        </div>
        {/* Amount box */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, paddingTop: "2px" }}>
          <span style={{ fontWeight: "bold", fontSize: "13px" }}>SR/=</span>
          <div style={{
            width: "80px",
            height: "26px",
            border: "1.5px solid #444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "13px",
          }}>
            {data.amount > 0 ? data.amount : ""}
          </div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ borderTop: `2px solid ${maroon}`, margin: "10px 0 7px" }} />

      {/* COMMITTED TO THE COMMUNITY */}
      <div style={{ textAlign: "center", fontWeight: "bold", color: maroon, fontSize: "11.5px", marginBottom: "7px" }}>
        COMMITTED TO THE COMMUNITY
      </div>

      {/* Two-column community services */}
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, fontSize: "10px", lineHeight: "1.7" }}>
          {["Frf Scheme (Family Relief Fund)", "Medical Aid", "Free Air Ticket To Stranded NRI's", "General Relief Fund"].map((s, i) => (
            <div key={i}><span style={{ color: maroon, fontWeight: "bold", marginRight: "4px" }}>✦</span>{s}</div>
          ))}
        </div>
        <div style={{ flex: 1.3, fontSize: "10px", lineHeight: "1.7" }}>
          {["Representative In India For Health & Govt Scheme Utilization", "Emergency Response Scheme.", "Dkmo Job Bureau", "Loan Scheme For Members"].map((s, i) => (
            <div key={i}><span style={{ color: maroon, fontWeight: "bold", marginRight: "4px" }}>✦</span>{s}</div>
          ))}
        </div>
        {/* Signature */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-end", flexShrink: 0, width: "140px" }}>
          <div style={{ borderTop: "1px solid #888", width: "130px", paddingTop: "3px", textAlign: "center", fontSize: "9.5px" }}>
            Treasurer / Gen. Secretary
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptsPage() {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const createRecordMutation = useCreateReceiptRecord({
    mutation: {
      onSuccess: () => {
        setSaved(true);
        toast({ title: "Receipt record saved to Documents" });
      },
      onError: (err) => {
        toast({ title: "Could not save record", description: String(err), variant: "destructive" });
      },
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      receiptDate: format(new Date(), "dd/MM/yyyy"),
      receiptNumber: "",
      jamathName: "",
      memberName: "",
      dkmoId: "",
      mobileNumber: "",
      whatsappNumber: "",
      paymentTypes: {
        lifeMembership: false,
        frfCase: "",
        voluntaryYearly: false,
        donation: false,
        loanRecovery: false,
        others: false,
      },
      amount: 0,
    },
  });

  const watchedValues = useWatch({ control: form.control });

  const getBasePath = () => {
    const base = import.meta.env.BASE_URL as string;
    return base.endsWith("/") ? base.slice(0, -1) : base;
  };

  const onDownload = useCallback(
    form.handleSubmit(async (values) => {
      try {
        const doc = await generateReceiptPdf(values, getBasePath());
        doc.save(`DKMO_Receipt_${values.receiptNumber || "draft"}.pdf`);
        toast({ title: "Receipt downloaded" });
      } catch {
        toast({ title: "Error generating receipt", variant: "destructive" });
      }
    }),
    []
  );

  const onPrint = useCallback(() => {
    window.print();
  }, []);

  const saveRecord = form.handleSubmit((values) => {
    createRecordMutation.mutate({
      data: {
        receiptNumber: values.receiptNumber,
        receiptDate: values.receiptDate,
        memberName: values.memberName,
        dkmoId: values.dkmoId,
        jamathName: values.jamathName,
        mobileNumber: values.mobileNumber,
        whatsappNumber: values.whatsappNumber,
        amount: values.amount,
        paymentTypes: JSON.stringify(values.paymentTypes),
      },
    });
  });

  const liveData = watchedValues as FormValues;

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-preview, .receipt-preview * { visibility: visible !important; }
          .receipt-preview {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 297mm !important;
            min-height: 210mm !important;
            border: none !important;
            font-size: 14px !important;
            padding: 12mm 14mm !important;
            transform: none !important;
          }
          @page { size: A5 landscape; margin: 0; }
        }
      `}</style>

      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <Receipt className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Receipt Generator</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Generate official DKMO receipts — preview updates live</p>
            </div>
          </div>
        </div>

        {/* ── FORM ──────────────────────────────────────────────── */}
        <Form {...form}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-5">

              {/* Row 1: Date / Receipt # / Jamath */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="receiptDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input {...field} placeholder="dd/mm/yyyy" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="receiptNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Receipt #</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. 2026-001" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="jamathName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jamath Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Riyadh Jamath" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Row 2: Name / DKMO ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="memberName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member Name</FormLabel>
                    <FormControl><Input {...field} placeholder="Full name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dkmoId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>DKMO ID #</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. DKMO-0001" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Row 3: Mobile / WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="mobileNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile #</FormLabel>
                    <FormControl><Input {...field} placeholder="+966 5x xxx xxxx" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="whatsappNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp #</FormLabel>
                    <FormControl><Input {...field} placeholder="+966 5x xxx xxxx" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Received Towards */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Received Towards</p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: "paymentTypes.lifeMembership" as const, label: "Life Membership" },
                    { name: "paymentTypes.voluntaryYearly" as const, label: "Voluntary Yearly Contribution" },
                    { name: "paymentTypes.donation" as const, label: "Donation" },
                    { name: "paymentTypes.loanRecovery" as const, label: "Loan Recovery" },
                    { name: "paymentTypes.others" as const, label: "Others" },
                  ].map((item) => (
                    <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => (
                      <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer select-none transition-colors text-sm font-medium
                        ${field.value ? "border-green-600 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"}`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={field.value as boolean}
                          onChange={field.onChange}
                        />
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${field.value ? "border-green-600 bg-green-600 text-white" : "border-slate-400"}`}>
                          {field.value ? "✓" : ""}
                        </span>
                        {item.label}
                      </label>
                    )} />
                  ))}
                  {/* FRF Case# */}
                  <FormField control={form.control} name="paymentTypes.frfCase" render={({ field }) => (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${field.value ? "border-green-600 bg-green-50 dark:bg-green-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${field.value ? "border-green-600 bg-green-600 text-white" : "border-slate-400"}`}>
                          {field.value ? "✓" : ""}
                        </span>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">FRF Case #</span>
                      </label>
                      <Input
                        className="h-7 w-28 text-sm"
                        placeholder="Case #"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </div>
                  )} />
                </div>
              </div>

              {/* Amount */}
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem className="max-w-[200px]">
                  <FormLabel>Amount (SR)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} className="text-lg font-bold" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" className="bg-green-700 hover:bg-green-800 text-white gap-2" onClick={onDownload}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={onPrint}>
                  <Printer className="h-4 w-4" />
                  Print Receipt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  disabled={createRecordMutation.isPending || saved}
                  onClick={saveRecord}
                >
                  <Save className="h-4 w-4" />
                  {saved ? "Saved ✓" : createRecordMutation.isPending ? "Saving…" : "Save Record"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 text-slate-500"
                  onClick={() => { form.reset(); setSaved(false); }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                {saved && (
                  <Link href="/documents" className="text-amber-600 dark:text-amber-400 underline flex items-center gap-1 text-sm">
                    <FolderOpen className="h-3.5 w-3.5" /> View in Documents
                  </Link>
                )}
              </div>
            </div>
        </Form>

        {/* ── LIVE RECEIPT PREVIEW ─────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Live Receipt Preview
            <span className="font-normal text-slate-400 dark:text-slate-500 text-xs">(updates as you fill the form)</span>
          </p>
          <div className="overflow-x-auto pb-2" ref={previewRef}>
            <ReceiptPreview data={liveData} />
          </div>
        </div>
      </div>
    </>
  );
}
