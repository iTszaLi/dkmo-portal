import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { Receipt, Download, Printer, RotateCcw, FolderOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

function generateReceiptPdf(data: FormValues): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [148, 210] });
  const W = 210;

  // Brown/dark red color for DKMO branding
  const brandColor: [number, number, number] = [101, 30, 10];
  const lightGray: [number, number, number] = [220, 220, 220];

  // ─── Header ───────────────────────────────────────────────
  // Left: logo circle placeholder
  doc.setFillColor(180, 60, 20);
  doc.circle(18, 18, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("DKMO", 18, 19, { align: "center" });

  // Title
  doc.setTextColor(...brandColor);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Dakshina Karnataka Muslim Okkoota - DKMO RIYADH", W / 2, 12, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("COMMITTED TO THE COMMUNITY", W / 2, 20, { align: "center" });

  // Divider
  doc.setDrawColor(...brandColor);
  doc.setLineWidth(0.5);
  doc.line(8, 25, W - 8, 25);

  // ─── Row 1: Date | Receipt # | Jamath Name ──────────────
  let y = 32;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Date:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.receiptDate, 22, y);

  doc.setFont("helvetica", "bold");
  doc.text("Receipt #:", 72, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.receiptNumber, 88, y);

  doc.setFont("helvetica", "bold");
  doc.text("Jamath Name:", 128, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.jamathName || "—", 153, y);

  doc.setDrawColor(...lightGray);
  doc.setLineWidth(0.3);
  doc.line(10, y + 2, W - 10, y + 2);

  // ─── Row 2: Name | DKMO ID ───────────────────────────────
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Name:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.memberName, 22, y);

  doc.setFont("helvetica", "bold");
  doc.text("DKMO ID #:", 128, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.dkmoId || "—", 150, y);

  doc.setDrawColor(...lightGray);
  doc.line(10, y + 2, W - 10, y + 2);

  // ─── Row 3: Mobile | WhatsApp ────────────────────────────
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Mobile #:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.mobileNumber || "—", 28, y);

  doc.setFont("helvetica", "bold");
  doc.text("WhatsApp #:", 128, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.whatsappNumber || "—", 152, y);

  doc.setDrawColor(...lightGray);
  doc.line(10, y + 2, W - 10, y + 2);

  // ─── Row 4: Received Towards ─────────────────────────────
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Received", 10, y);
  doc.text("Towards:", 10, y + 5);

  const types = [
    { label: "Life Membership", checked: data.paymentTypes.lifeMembership },
    { label: `FRF Case# ${data.paymentTypes.frfCase || ""}`, checked: !!data.paymentTypes.frfCase },
    { label: "Voluntary Yearly Contribution", checked: data.paymentTypes.voluntaryYearly },
    { label: "Donation", checked: data.paymentTypes.donation },
    { label: "Loan Recovery", checked: data.paymentTypes.loanRecovery },
    { label: "Others", checked: data.paymentTypes.others },
  ];

  const boxW = 26;
  types.forEach((t, i) => {
    const x = 24 + i * (boxW + 2);
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y - 3, boxW, 10, 2, 2);
    if (t.checked) {
      doc.setFillColor(34, 139, 34);
      doc.roundedRect(x + 1, y - 2, boxW - 2, 8, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(50, 50, 50);
    }
    doc.setFont("helvetica", t.checked ? "bold" : "normal");
    doc.setFontSize(6.5);
    doc.text(t.label, x + boxW / 2, y + 2, { align: "center", maxWidth: boxW - 2 });
  });

  // Amount box
  const amtX = 24 + 6 * (boxW + 2) + 2;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SR/=", amtX, y + 2);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.rect(amtX + 8, y - 3, 22, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    data.amount > 0 ? String(data.amount) : "",
    amtX + 19,
    y + 3,
    { align: "center" }
  );

  // ─── Divider ──────────────────────────────────────────────
  y += 18;
  doc.setDrawColor(...brandColor);
  doc.setLineWidth(0.8);
  doc.line(8, y, W - 8, y);

  // ─── Footer ───────────────────────────────────────────────
  y += 7;
  doc.setTextColor(...brandColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("COMMITTED TO THE COMMUNITY", W / 2, y, { align: "center" });

  y += 5;
  const services = [
    "Frf Scheme (Family Relief Fund)",
    "Medical Aid",
    "Free Air Ticket To Stranded NRI's",
    "General Relief Fund",
    "Representative In India For Health & Govt Scheme Utilization",
    "Emergency Response Scheme.",
    "Dkmo Job Bureau",
    "Loan Scheme For Members",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  const col1 = services.slice(0, 4);
  const col2 = services.slice(4);
  col1.forEach((s, i) => {
    doc.text(`✦  ${s}`, 12, y + i * 6);
  });
  col2.forEach((s, i) => {
    doc.text(`✦  ${s}`, W / 2 + 4, y + i * 6);
  });

  // Signature line
  const sigY = y + 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.line(W - 60, sigY - 2, W - 10, sigY - 2);
  doc.text("Treasurer / Gen. Secretary", W - 35, sigY + 2, { align: "center" });

  return doc;
}

export default function ReceiptsPage() {
  const { toast } = useToast();
  const [generated, setGenerated] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const saveRecord = (values: FormValues) => {
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
  };

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

  const onPreview = (values: FormValues) => {
    try {
      const doc = generateReceiptPdf(values);
      const url = doc.output("bloburl");
      window.open(url as unknown as string, "_blank");
      setGenerated(true);
    } catch {
      toast({ title: "Error generating receipt", variant: "destructive" });
    }
  };

  const onDownload = (values: FormValues) => {
    try {
      const doc = generateReceiptPdf(values);
      doc.save(`DKMO_Receipt_${values.receiptNumber || "draft"}.pdf`);
      setGenerated(true);
      toast({ title: "Receipt downloaded" });
    } catch {
      toast({ title: "Error generating receipt", variant: "destructive" });
    }
  };

  const onPrint = (values: FormValues) => {
    try {
      const doc = generateReceiptPdf(values);
      doc.autoPrint();
      const url = doc.output("bloburl");
      window.open(url as unknown as string, "_blank");
    } catch {
      toast({ title: "Error printing receipt", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <Receipt className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Receipt Generator</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Generate DKMO official receipts as PDF</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">

          {/* Row 1 */}
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

          {/* Row 2 */}
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

          {/* Row 3 */}
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

          {/* Payment Types */}
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Received Towards</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { name: "paymentTypes.lifeMembership" as const, label: "Life Membership" },
                { name: "paymentTypes.voluntaryYearly" as const, label: "Voluntary Yearly Contribution" },
                { name: "paymentTypes.donation" as const, label: "Donation" },
                { name: "paymentTypes.loanRecovery" as const, label: "Loan Recovery" },
                { name: "paymentTypes.others" as const, label: "Others" },
              ].map((item) => (
                <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value as boolean}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal text-sm cursor-pointer">{item.label}</FormLabel>
                  </FormItem>
                )} />
              ))}
            </div>
            {/* FRF Case field */}
            <div className="mt-3">
              <FormField control={form.control} name="paymentTypes.frfCase" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={(checked) => !checked && field.onChange("")}
                      />
                      <span className="text-sm font-normal text-slate-700 dark:text-slate-300">FRF Case #</span>
                    </div>
                  </FormControl>
                  <Input
                    className="max-w-[180px] h-8 text-sm"
                    placeholder="Case number"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-end gap-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem className="flex-1 max-w-[200px]">
                <FormLabel>Amount (SR)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} step="0.01" {...field} className="text-lg font-bold" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
            <Button
              type="button"
              className="bg-green-700 hover:bg-green-800 text-white gap-2"
              onClick={form.handleSubmit(onPreview)}
            >
              <Receipt className="h-4 w-4" />
              Preview Receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={form.handleSubmit(onDownload)}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={form.handleSubmit(onPrint)}
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              disabled={createRecordMutation.isPending || saved}
              onClick={form.handleSubmit(saveRecord)}
            >
              <Save className="h-4 w-4" />
              {saved ? "Saved ✓" : createRecordMutation.isPending ? "Saving…" : "Save Record"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-slate-500"
              onClick={() => { form.reset(); setGenerated(false); setSaved(false); }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>

          {generated && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400">
                ✓ Receipt generated. Check your browser for the PDF.
              </span>
              {saved && (
                <Link href="/documents" className="text-amber-600 dark:text-amber-400 underline flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" /> View in Documents
                </Link>
              )}
            </div>
          )}
        </div>
      </Form>
    </div>
  );
}
