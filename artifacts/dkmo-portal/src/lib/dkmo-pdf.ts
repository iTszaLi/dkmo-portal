import jsPDF from "jspdf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface DkmoPdfDependent {
  fullName?: string | null;
  age?: string | number | null;
  relation?: string | null;
}

export interface DkmoPdfData {
  fullName: string;
  dateOfBirth?: string | null;
  passportNumber?: string | null;
  iqamaNumber?: string | null;
  occupation?: string | null;
  companyName?: string | null;
  maritalStatus?: string | null;
  familyInSaudi?: string | null;
  bloodGroup?: string | null;
  photoDataUrl?: string | null;
  areaSaudi?: string | null;
  poBox?: string | null;
  businessPhone?: string | null;
  mobileSaudi?: string | null;
  email?: string | null;
  emergencyNameSaudi?: string | null;
  emergencyMobileSaudi?: string | null;
  houseName?: string | null;
  postalAddress?: string | null;
  district?: string | null;
  nearestJamaath?: string | null;
  homePhone?: string | null;
  mobileIndia?: string | null;
  emergencyNameIndia?: string | null;
  emergencyMobileIndia?: string | null;
  notes?: string | null;
  refMemberName?: string | null;
  refMemberId?: string | null;
}

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

export async function generateDkmoPdf(
  form: DkmoPdfData,
  dependents: DkmoPdfDependent[],
  dkmoNumber: string,
  submissionDate: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const mL = 12;
  const mR = 198;
  const cW = mR - mL;
  const black: [number, number, number] = [0, 0, 0];
  const red: [number, number, number] = [180, 20, 20];
  const grey: [number, number, number] = [90, 90, 90];
  const green: [number, number, number] = [30, 120, 60];
  const lightGreen: [number, number, number] = [220, 245, 225];
  const lgrey: [number, number, number] = [185, 185, 185];
  const hdrFill: [number, number, number] = [242, 242, 242];

  const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

  // ── HEADER ──────────────────────────────────────────────────────────────────
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", mL, 5, 24, 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...black);
  doc.text("DAKSHINA KARNATAKA MUSLIM OKKOOTA", PW / 2, 13, { align: "center" });
  doc.setFontSize(10);
  doc.text("Membership Application Form", PW / 2, 21, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...grey);
  doc.text("DKMO ID No.", mR - 37, 8);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.3);
  doc.rect(mR - 37, 9.5, 35, 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...black);
  doc.text(dkmoNumber, mR - 19.5, 14.5, { align: "center" });

  let y = 33;
  doc.setLineWidth(0.5);
  doc.setDrawColor(...black);
  doc.line(mL, y, mR, y);
  y += 4;

  // ── IMPORTANT NOTE ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...red);
  doc.text("Important Note:", mL, y);
  y += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  const noteText =
    "In Case of any changes in your Contact Information, You have to inform to the General Secretary of DKMO Immediately.";
  const noteLines = doc.splitTextToSize(noteText, cW) as string[];
  doc.text(noteLines, mL, y);
  y += noteLines.length * 3.5 + 3;

  // ── REFERENCE MEMBER GREEN BOX (always shown) ────────────────────────────────
  const refBoxH = 16;
  doc.setFillColor(...lightGreen);
  doc.setDrawColor(...green);
  doc.setLineWidth(0.5);
  doc.roundedRect(mL, y, cW, refBoxH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...green);
  doc.text("Reference Member", mL + 3, y + 4.5);

  const colHalf = cW / 2 - 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text("Member Name:", mL + 3, y + 9.5);
  doc.text("Member ID:", mL + cW / 2 + 3, y + 9.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);
  doc.text(form.refMemberName || "__________________________________", mL + 27, y + 9.5, {
    maxWidth: colHalf,
  });
  doc.text(form.refMemberId || "__________________________________", mL + cW / 2 + 22, y + 9.5, {
    maxWidth: colHalf,
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(...grey);
  doc.text("The DKMO member who referred me to join this membership.", mL + 3, y + 14);

  y += refBoxH + 3;

  // ── DIVIDER ──────────────────────────────────────────────────────────────────
  doc.setLineWidth(0.2);
  doc.setDrawColor(...lgrey);
  doc.line(mL, y, mR, y);
  y += 4;

  // ── PHOTO BOX ───────────────────────────────────────────────────────────────
  const photoW = 26;
  const photoH = 30;
  const photoX = mR - photoW;
  const photoY = y;

  if (form.photoDataUrl) {
    doc.addImage(form.photoDataUrl, "JPEG", photoX, photoY, photoW, photoH);
  } else {
    doc.setFillColor(255, 250, 220);
    doc.setDrawColor(...lgrey);
    doc.rect(photoX, photoY, photoW, photoH, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...lgrey);
    doc.text("Affix Passport", photoX + photoW / 2, photoY + photoH / 2 - 2, {
      align: "center",
    });
    doc.text("size Photo", photoX + photoW / 2, photoY + photoH / 2 + 3, { align: "center" });
  }

  const mainW = cW - photoW - 4;

  // ── PERSONAL INFO FIELDS ──────────────────────────────────────────────────────
  // Each field: label (tiny grey) at top, underline at bottom, value just above underline
  function field(
    label: string,
    value: string,
    fx: number,
    fy: number,
    fw: number,
    fh = 9,
  ) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...grey);
    doc.text(label, fx + 1, fy + 2.5);
    doc.setDrawColor(...lgrey);
    doc.setLineWidth(0.2);
    doc.line(fx, fy + fh - 0.5, fx + fw, fy + fh - 0.5);
    if (value) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...black);
      doc.text(value, fx + 1, fy + fh - 2, { maxWidth: fw - 2 });
    }
  }

  const nameH = 10;
  field("Full Name of the Applicant", form.fullName || "", mL, y, mainW, nameH);
  y += nameH + 1;

  const colW = (mainW - 3) / 2;
  const rowH = 9;

  field("Date of Birth", form.dateOfBirth || "", mL, y, colW, rowH);
  field("Passport No.", form.passportNumber || "", mL + colW + 3, y, colW, rowH);
  y += rowH + 1;

  field("Occupation / Job Title", form.occupation || "", mL, y, colW, rowH);
  field("Iqama / Residence ID No.", form.iqamaNumber || "", mL + colW + 3, y, colW, rowH);
  y += rowH + 1;

  field("Company / Employer Name", form.companyName || "", mL, y, mainW, rowH);
  y += rowH + 1;

  field("Marital Status", form.maritalStatus || "", mL, y, colW, rowH);
  field("Family living in Saudi (Yes / No)", form.familyInSaudi || "", mL + colW + 3, y, colW, rowH);
  y += rowH + 1;

  field("Blood Group", form.bloodGroup || "", mL, y, colW, rowH);
  y += rowH + 2;

  // Advance past photo if still overlapping
  y = Math.max(y, photoY + photoH + 4);

  // ── CONTACT TABLE ────────────────────────────────────────────────────────────
  doc.setLineWidth(0.3);
  doc.setDrawColor(...black);
  const leftW = cW / 2;
  const rightW = cW / 2;

  doc.setFillColor(...hdrFill);
  doc.rect(mL, y, leftW, 6.5, "F");
  doc.rect(mL + leftW, y, rightW, 6.5, "F");
  doc.rect(mL, y, cW, 6.5);
  doc.setLineWidth(0.3);
  doc.line(mL + leftW, y, mL + leftW, y + 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);
  doc.text("Contact details in Saudi Arabia", mL + leftW / 2, y + 4.2, { align: "center" });
  doc.text("Contact details in India", mL + leftW + rightW / 2, y + 4.2, { align: "center" });
  y += 6.5;

  const contactRowH = 9;
  const contactRows: [string, string, string, string][] = [
    ["Area / Location in Saudi Arabia", form.areaSaudi || "", "Name of Home / House", form.houseName || ""],
    ["P.O. Box No. & Pin Code", form.poBox || "", "Postal Address", form.postalAddress || ""],
    [
      "Business Tel. No.",
      form.businessPhone || "",
      "District & Nearest Jama'at",
      `${form.district || ""}${form.nearestJamaath ? " / " + form.nearestJamaath : ""}`,
    ],
    ["Mobile No.", form.mobileSaudi || "", "Home Tel. No.", form.homePhone || ""],
    ["Email ID", form.email || "", "Mobile No. (India)", form.mobileIndia || ""],
    [
      "Emergency Contact (name & mobile)",
      `${form.emergencyNameSaudi || ""} ${form.emergencyMobileSaudi || ""}`.trim(),
      "Emergency Contact (name & mobile)",
      `${form.emergencyNameIndia || ""} ${form.emergencyMobileIndia || ""}`.trim(),
    ],
  ];

  for (const [lLabel, lVal, rLabel, rVal] of contactRows) {
    doc.setLineWidth(0.2);
    doc.rect(mL, y, leftW, contactRowH);
    doc.rect(mL + leftW, y, rightW, contactRowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...grey);
    doc.text(doc.splitTextToSize(lLabel, leftW - 3) as string[], mL + 1.5, y + 2.5);
    doc.text(doc.splitTextToSize(rLabel, rightW - 3) as string[], mL + leftW + 1.5, y + 2.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    if (lVal) doc.text(String(lVal), mL + 1.5, y + 7, { maxWidth: leftW - 3 });
    if (rVal) doc.text(String(rVal), mL + leftW + 1.5, y + 7, { maxWidth: rightW - 3 });
    y += contactRowH;
  }
  y += 3;

  // ── DEPENDANTS TABLE ─────────────────────────────────────────────────────────
  if (y > 215) { doc.addPage(); y = 14; }

  doc.setFillColor(...hdrFill);
  doc.rect(mL, y, cW, 6, "F");
  doc.rect(mL, y, cW, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);
  doc.text("Dependants Details", mL + 2, y + 4);
  y += 6;

  const depCols = [
    { label: "Name of Dependant", w: cW * 0.54 },
    { label: "Age", w: cW * 0.18 },
    { label: "Relationship", w: cW * 0.28 },
  ];
  let cx = mL;
  for (const c of depCols) {
    doc.setFillColor(250, 250, 250);
    doc.rect(cx, y, c.w, 5.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...black);
    doc.text(c.label, cx + c.w / 2, y + 3.8, { align: "center" });
    cx += c.w;
  }
  y += 5.5;

  const depRowH = 7;
  for (let i = 0; i < 7; i++) {
    const dep = dependents[i];
    cx = mL;
    for (const c of depCols) {
      doc.setLineWidth(0.2);
      doc.rect(cx, y, c.w, depRowH);
      if (dep) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...black);
        const val =
          c.label === "Name of Dependant"
            ? dep.fullName || ""
            : c.label === "Age"
              ? String(dep.age ?? "")
              : dep.relation || "";
        if (val) doc.text(val, cx + 1.5, y + 5, { maxWidth: c.w - 3 });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...lgrey);
        doc.text(`${i + 1})`, cx + 1.5, y + 5);
      }
      cx += c.w;
    }
    y += depRowH;
  }
  y += 3;

  // ── NOTES ────────────────────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 14; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text("Any other details, if any", mL, y);
  y += 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.text("(If you are not willing to avail contribution, please mention so herein)", mL, y);
  y += 3;
  if (form.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    const nl = doc.splitTextToSize(form.notes, cW) as string[];
    doc.text(nl, mL, y);
    y += nl.length * 4;
  }
  doc.setDrawColor(...lgrey);
  doc.setLineWidth(0.2);
  doc.line(mL, y + 3, mR, y + 3);
  y += 9;

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  if (y > 268) { doc.addPage(); y = 14; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text(`Submitted: ${submissionDate}`, mR, y, { align: "right" });
  y += 8;

  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mL + 55, y);
  doc.line(mR - 75, y, mR, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text("Applicant's Signature & date", mL, y);
  doc.text("Signature of President / General Secretary-DKMO", mR, y, { align: "right" });

  doc.save(
    `DKMO-Membership-${dkmoNumber}-${form.fullName.replace(/\s+/g, "-")}.pdf`,
  );
}
