import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const GREEN: [number, number, number] = [5, 150, 105];
const LIGHT_GREEN: [number, number, number] = [240, 253, 244];

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch(`${basePath}/logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function ts(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sar(amount: number): string {
  return `SAR ${amount.toLocaleString("en", { minimumFractionDigits: 2 })}`;
}

const CLAIM_TYPE_LABEL: Record<string, string> = {
  death_benefit: "Death Benefit",
  emergency: "Emergency Assistance",
  air_ticket: "Air Ticket Support",
  other: "Other",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  disbursed: "Disbursed",
};

export interface FrfClaimPdfData {
  id: string;
  claimantName: string;
  membershipId: string;
  claimType: string;
  amountRequested: number;
  amountApproved: number;
  status: string;
  claimDate: string | null;
  approvedDate: string | null;
  approvedBy: string;
  underReviewAt: string | null;
  underReviewBy: string;
  disbursedAt: string | null;
  disbursedBy: string;
  rejectedBy: string;
  rejectedAt: string | null;
  reviewNotes: string;
  beneficiaryName: string;
  beneficiaryRelation: string;
  description: string;
  notes: string;
  createdAt: string;
}

export async function generateClaimPdf(claim: FrfClaimPdfData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, 210, 32, "F");
  if (logo) doc.addImage(logo, "PNG", 8, 5, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("DKMO Family Relief Fund — Claim Form", 36, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Dakshina Karnataka Muslim Ookota · FRF Claims Department", 36, 22);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, 36, 29);

  // ─── Claim reference ──────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_GREEN);
  doc.rect(0, 34, 210, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text(`Claim Reference: ${claim.id.slice(0, 8).toUpperCase()}`, 10, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const statusLabel = STATUS_LABEL[claim.status] ?? claim.status;
  doc.text(`Status: ${statusLabel}   ·   Claim Date: ${ts(claim.claimDate)}`, 10, 48);

  let y = 58;

  // ─── Claimant & Beneficiary ───────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["Claimant Details", ""]],
    body: [
      ["Claimant Name", claim.claimantName || "—"],
      ["Membership ID", claim.membershipId || "—"],
      ["Claim Type", CLAIM_TYPE_LABEL[claim.claimType] ?? claim.claimType],
      ["Beneficiary Name", claim.beneficiaryName || "—"],
      ["Beneficiary Relation", claim.beneficiaryRelation || "—"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_GREEN },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { cellWidth: 120 } },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Financial Summary ────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["Financial Details", ""]],
    body: [
      ["Amount Requested (SAR)", sar(claim.amountRequested)],
      ["Amount Approved (SAR)", claim.amountApproved > 0 ? sar(claim.amountApproved) : "—"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_GREEN },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { cellWidth: 120 } },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Description & Notes ──────────────────────────────────────────────────
  if (claim.description || claim.notes || claim.reviewNotes) {
    autoTable(doc, {
      startY: y,
      head: [["Description & Notes", ""]],
      body: [
        ...(claim.description ? [["Description", claim.description]] : []),
        ...(claim.notes ? [["Notes", claim.notes]] : []),
        ...(claim.reviewNotes ? [["Review Notes", claim.reviewNotes]] : []),
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: LIGHT_GREEN },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { cellWidth: 120 } },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── Status Timeline ──────────────────────────────────────────────────────
  const timelineRows: [string, string, string][] = [
    ["1. Submitted", ts(claim.claimDate ?? claim.createdAt), claim.claimantName],
  ];
  if (claim.underReviewAt) timelineRows.push(["2. Under Review", ts(claim.underReviewAt), claim.underReviewBy || "—"]);
  if (claim.status === "approved" || claim.status === "disbursed") {
    if (claim.approvedDate) timelineRows.push(["3. Approved ✓", ts(claim.approvedDate), claim.approvedBy || "—"]);
    if (claim.disbursedAt) timelineRows.push(["4. Disbursed ✓", ts(claim.disbursedAt), claim.disbursedBy || "—"]);
  }
  if (claim.status === "rejected" && claim.rejectedAt) {
    timelineRows.push(["3. Rejected ✗", ts(claim.rejectedAt), claim.rejectedBy || "—"]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Status Timeline", "Date", "By"]],
    body: timelineRows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_GREEN },
    columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" }, 1: { cellWidth: 50 }, 2: { cellWidth: 70 } },
    theme: "grid",
  });

  // ─── Footer ───────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("DKMO — Dakshina Karnataka Muslim Ookota · Committed to the Community", 105, pageH - 8, { align: "center" });
  doc.text("This is a computer-generated document.", 105, pageH - 4, { align: "center" });

  const claimRef = claim.id.slice(0, 8).toUpperCase();
  const dateStr = new Date().toISOString().split("T")[0];
  doc.save(`DKMO_Claim_${claimRef}_${dateStr}.pdf`);
}
