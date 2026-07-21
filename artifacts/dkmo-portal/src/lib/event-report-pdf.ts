import jsPDF from "jspdf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface EventReportSponsor {
  sponsorName: string;
  contactPerson?: string;
  amount: number;
  sponsorshipType: string;
  notes?: string;
}

export interface EventReportExpense {
  category: string;
  description?: string;
  vendor?: string;
  amount: number;
  expenseDate?: string;
}

export interface EventReportData {
  eventName: string;
  eventDate?: string | null;
  location?: string;
  status: string;
  budget: number;
  sponsors: EventReportSponsor[];
  expenses: EventReportExpense[];
  ticketsSold: number;
  ticketsTotal: number;
  ticketRevenue: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export async function generateEventReportPdf(data: EventReportData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const mL = 12;
  const mR = 198;
  const cW = mR - mL;

  const black:   [number, number, number] = [0, 0, 0];
  const dkgreen: [number, number, number] = [21, 100, 42];
  const grey:    [number, number, number] = [80, 80, 80];
  const lgrey:   [number, number, number] = [190, 190, 190];
  const red:     [number, number, number] = [180, 30, 30];

  const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

  // ── HEADER ────────────────────────────────────────────────────────
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", mL, 6, 30, 30);
  } else {
    doc.setDrawColor(...black);
    doc.setLineWidth(0.4);
    doc.rect(mL, 6, 28, 28);
    doc.setTextColor(...grey);
    doc.setFontSize(6);
    doc.text("DKMO", mL + 14, 22, { align: "center" });
  }

  doc.setTextColor(...black);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("DAKSHINA KARNATAKA MUSLIM OKKOOTA", PW / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Event Financial Report", PW / 2, 24, { align: "center" });

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("Printed on:", 153, 11);
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.4);
  doc.rect(153, 13, 45, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...black);
  doc.text(today, 175.5, 19.5, { align: "center" });

  doc.setDrawColor(...dkgreen);
  doc.setLineWidth(1.0);
  doc.line(mL, 34, mR, 34);
  doc.setLineWidth(0.3);
  doc.line(mL, 35.5, mR, 35.5);

  let y = 41;

  // ── helper: green section header ─────────────────────────────────
  const sectionHeader = (title: string) => {
    doc.setFillColor(...dkgreen);
    doc.rect(mL, y, cW, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, mL + 3, y + 5);
    y += 7;
  };

  const checkPageBreak = (needed = 20) => {
    if (y + needed > 272) {
      doc.addPage();
      y = 15;
    }
  };

  // ── EVENT DETAILS ─────────────────────────────────────────────────
  sectionHeader("EVENT DETAILS");
  const halfW = cW / 2;
  const dateStr = data.eventDate
    ? new Date(data.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const statusStr = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  const infoRows = [
    { l: "Event Name", lv: data.eventName, r: "Status", rv: statusStr },
    { l: "Date", lv: dateStr, r: "Approved Budget (SAR)", rv: fmt(data.budget) },
    { l: "Location", lv: data.location || "—", r: "", rv: "" },
  ];
  const infoH = infoRows.length * 10;
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.3);
  doc.rect(mL, y, cW, infoH);
  doc.setLineWidth(0.2);
  doc.line(mL + halfW, y, mL + halfW, y + infoH);

  for (let i = 0; i < infoRows.length; i++) {
    const row = infoRows[i];
    const ry = y + i * 10;
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(row.l, mL + 3, ry + 3.5);
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(row.lv, mL + 3, ry + 8.5, { maxWidth: halfW - 6 });
    if (row.r) {
      doc.setTextColor(...grey);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(row.r, mL + halfW + 3, ry + 3.5);
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(row.rv, mL + halfW + 3, ry + 8.5, { maxWidth: halfW - 6 });
    }
    if (i < infoRows.length - 1) {
      doc.setDrawColor(...lgrey);
      doc.setLineWidth(0.15);
      doc.line(mL + 0.5, ry + 10, mR - 0.5, ry + 10);
    }
  }
  y += infoH + 6;

  // ── FINANCIAL OVERVIEW ────────────────────────────────────────────
  checkPageBreak(55);
  sectionHeader("FINANCIAL OVERVIEW");

  const sponsorTotal = data.sponsors.reduce((s, x) => s + x.amount, 0);
  const ovRows: { label: string; value: number; bold?: boolean; divider?: boolean; red?: boolean; colored?: boolean }[] = [
    { label: "  Sponsor Contributions", value: sponsorTotal },
    { label: "  Ticket Revenue", value: data.ticketRevenue },
    { label: "Total Income", value: data.totalIncome, bold: true, divider: true },
    { label: "Total Expenses", value: data.totalExpenses, bold: true, red: true },
    { label: "Net Balance", value: data.netBalance, bold: true, divider: true, colored: true },
  ];

  const ovH = ovRows.reduce((h, r) => h + (r.divider ? 9 : 8), 0) + 2;
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.3);
  doc.rect(mL, y, cW, ovH);
  let ovy = y + 1;

  for (const row of ovRows) {
    if (row.divider) {
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.4);
      doc.line(mL + 0.5, ovy, mR - 0.5, ovy);
      ovy += 1;
    }
    const rh = 8;
    const txtColor: [number, number, number] = row.colored
      ? (data.netBalance >= 0 ? [21, 100, 42] : red)
      : row.red ? red : (row.bold ? black : grey);
    doc.setTextColor(...txtColor);
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.bold ? 9.5 : 9);
    doc.text(row.label, mL + 4, ovy + 5.5);
    const valStr = row.bold ? `SAR ${fmt(row.value)}` : fmt(row.value);
    doc.text(valStr, mR - 4, ovy + 5.5, { align: "right" });
    ovy += rh;
  }
  y += ovH + 6;

  // ── SPONSORS ─────────────────────────────────────────────────────
  checkPageBreak(30);
  sectionHeader(`SPONSORS  (${data.sponsors.length} total)`);

  if (data.sponsors.length === 0) {
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.text("No sponsors recorded for this event.", mL + 3, y + 6);
    y += 13;
  } else {
    const spNameW = cW * 0.44;
    const spTypeW = cW * 0.2;

    doc.setFillColor(230, 245, 233);
    doc.rect(mL, y, cW, 7, "F");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Sponsor / Contact", mL + 3, y + 5);
    doc.text("Type", mL + spNameW + spTypeW / 2, y + 5, { align: "center" });
    doc.text("Amount (SAR)", mR - 3, y + 5, { align: "right" });
    doc.setDrawColor(...lgrey);
    doc.setLineWidth(0.3);
    doc.line(mL, y + 7, mR, y + 7);
    y += 7;

    for (const [i, sp] of data.sponsors.entries()) {
      checkPageBreak(10);
      const bg: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : [247, 252, 248];
      doc.setFillColor(...bg);
      doc.rect(mL, y, cW, 9, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...black);
      doc.text(sp.sponsorName, mL + 3, y + 4, { maxWidth: spNameW - 4 });
      if (sp.contactPerson) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...grey);
        doc.text(sp.contactPerson, mL + 3, y + 8, { maxWidth: spNameW - 4 });
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      const typeLabel = sp.sponsorshipType === "in-kind" ? "In-Kind" : "Cash";
      doc.text(typeLabel, mL + spNameW + spTypeW / 2, y + 5.5, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...dkgreen);
      doc.text(fmt(sp.amount), mR - 3, y + 5.5, { align: "right" });
      doc.setDrawColor(...lgrey);
      doc.setLineWidth(0.15);
      doc.line(mL, y + 9, mR, y + 9);
      y += 9;
    }

    doc.setFillColor(218, 240, 222);
    doc.rect(mL, y, cW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...black);
    doc.text("Total Sponsor Contributions", mL + 3, y + 5.5);
    doc.setTextColor(...dkgreen);
    doc.text(`SAR ${fmt(sponsorTotal)}`, mR - 3, y + 5.5, { align: "right" });
    y += 8 + 6;
  }

  // ── EXPENSE BREAKDOWN ─────────────────────────────────────────────
  checkPageBreak(30);
  sectionHeader(`EXPENSE BREAKDOWN  (${data.expenses.length} items)`);

  if (data.expenses.length === 0) {
    doc.setTextColor(...grey);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.text("No expenses recorded for this event.", mL + 3, y + 6);
    y += 13;
  } else {
    const byCategory: Record<string, { total: number; items: EventReportExpense[] }> = {};
    for (const e of data.expenses) {
      if (!byCategory[e.category]) byCategory[e.category] = { total: 0, items: [] };
      byCategory[e.category].total += e.amount;
      byCategory[e.category].items.push(e);
    }
    const categories = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

    const descColW = cW * 0.45;
    const vendorColW = cW * 0.25;
    const dateColW = cW * 0.14;

    doc.setFillColor(230, 245, 233);
    doc.rect(mL, y, cW, 7, "F");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Category / Description", mL + 3, y + 5);
    doc.text("Vendor", mL + descColW + 3, y + 5);
    doc.text("Date", mL + descColW + vendorColW + 3, y + 5);
    doc.text("Amount (SAR)", mR - 3, y + 5, { align: "right" });
    doc.setDrawColor(...lgrey);
    doc.setLineWidth(0.3);
    doc.line(mL, y + 7, mR, y + 7);
    y += 7;

    for (const [cat, { total, items }] of categories) {
      checkPageBreak(14);
      doc.setFillColor(240, 248, 242);
      doc.rect(mL, y, cW, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...black);
      doc.text(cat, mL + 3, y + 5.5);
      doc.setTextColor(...red);
      doc.text(`SAR ${fmt(total)}`, mR - 3, y + 5.5, { align: "right" });
      doc.setDrawColor(...lgrey);
      doc.setLineWidth(0.25);
      doc.line(mL, y + 8, mR, y + 8);
      y += 8;

      for (const [j, item] of items.entries()) {
        checkPageBreak(9);
        const bg: [number, number, number] = j % 2 === 0 ? [255, 255, 255] : [250, 253, 251];
        doc.setFillColor(...bg);
        doc.rect(mL, y, cW, 8, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...grey);
        doc.text(`  ${item.description || cat}`, mL + 3, y + 5, { maxWidth: descColW - 8 });
        doc.setTextColor(80, 80, 80);
        doc.text(item.vendor || "—", mL + descColW + 3, y + 5, { maxWidth: vendorColW - 4 });
        doc.text(item.expenseDate || "—", mL + descColW + vendorColW + 3, y + 5, { maxWidth: dateColW - 2 });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...black);
        doc.text(fmt(item.amount), mR - 3, y + 5, { align: "right" });
        doc.setDrawColor(220, 235, 222);
        doc.setLineWidth(0.12);
        doc.line(mL + 2, y + 8, mR - 2, y + 8);
        y += 8;
      }
    }

    checkPageBreak(10);
    doc.setFillColor(255, 232, 232);
    doc.rect(mL, y, cW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...black);
    doc.text("Total Expenses", mL + 3, y + 5.5);
    doc.setTextColor(...red);
    doc.text(`SAR ${fmt(data.totalExpenses)}`, mR - 3, y + 5.5, { align: "right" });
    y += 8 + 6;
  }

  // ── TICKET REVENUE ────────────────────────────────────────────────
  checkPageBreak(46);
  sectionHeader("TICKET REVENUE");

  const soldPct = data.ticketsTotal > 0 ? Math.round((data.ticketsSold / data.ticketsTotal) * 100) : 0;
  const ticketRows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Total Tickets Issued", value: String(data.ticketsTotal) },
    { label: "Tickets Sold", value: `${data.ticketsSold}${data.ticketsTotal > 0 ? `  (${soldPct}%)` : ""}` },
    { label: "Tickets Unsold", value: String(data.ticketsTotal - data.ticketsSold) },
    { label: "Total Ticket Revenue (SAR)", value: fmt(data.ticketRevenue), highlight: true },
  ];
  const tickH = ticketRows.length * 8 + 1;
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.3);
  doc.rect(mL, y, cW, tickH);

  for (const [i, row] of ticketRows.entries()) {
    const ry = y + i * 8 + 1;
    const bg: [number, number, number] = row.highlight ? [218, 240, 222] : i % 2 === 0 ? [255, 255, 255] : [248, 252, 249];
    doc.setFillColor(...bg);
    doc.rect(mL, ry - 1, cW, 8, "F");
    doc.setTextColor(row.highlight ? 21 : 60, row.highlight ? 100 : 60, row.highlight ? 42 : 60);
    doc.setFont("helvetica", row.highlight ? "bold" : "normal");
    doc.setFontSize(9);
    doc.text(row.label, mL + 4, ry + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(row.highlight ? 21 : 0, row.highlight ? 100 : 0, row.highlight ? 42 : 0);
    doc.text(row.value, mR - 4, ry + 4.5, { align: "right" });
    if (i < ticketRows.length - 1) {
      doc.setDrawColor(...lgrey);
      doc.setLineWidth(0.12);
      doc.line(mL + 0.5, ry + 7, mR - 0.5, ry + 7);
    }
  }
  y += tickH + 8;

  // ── SIGNATURES ────────────────────────────────────────────────────
  y = Math.max(y + 4, 255);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mL + 68, y);
  doc.line(mR - 80, y, mR, y);
  doc.setTextColor(...grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Treasurer's Signature & Date", mL, y + 4.5);
  doc.text("President / General Secretary – DKMO", mR - 80, y + 4.5);

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...lgrey);
    doc.text(
      `DAKSHINA KARNATAKA MUSLIM OKKOOTA  ·  Confidential Financial Report  ·  Page ${p} of ${pageCount}`,
      PW / 2,
      291,
      { align: "center" },
    );
  }

  const safeName = data.eventName.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  doc.save(`DKMO_Event_Report_${safeName}.pdf`);
}
