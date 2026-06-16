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
  const grey: [number, number, number] = [80, 80, 80];
  const green: [number, number, number] = [30, 120, 60];
  const lightGreen: [number, number, number] = [220, 245, 225];
  const lgrey: [number, number, number] = [160, 160, 160];

  const logoDataUrl = await loadImageAsBase64(`${basePath}/logo.png`);

  // ── HEADER ──────────────────────────────────────────────────────────────────
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", mL, 6, 28, 28);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...black);
  doc.text("DAKSHINA KARNATAKA MUSLIM OKKOOTA", PW / 2, 14, { align: "center" });
  doc.setFontSize(11);
  doc.text("Membership Application Form", PW / 2, 22, { align: "center" });

  // DKMO number top right
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...grey);
  doc.text("DKMO ID No.", mR - 40, 9);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.3);
  doc.rect(mR - 40, 11, 38, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...black);
  doc.text(dkmoNumber, mR - 21, 16, { align: "center" });

  let y = 38;
  doc.setLineWidth(0.5);
  doc.setDrawColor(...black);
  doc.line(mL, y, mR, y);
  y += 4;

  // ── IMPORTANT NOTE ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...red);
  doc.text("Important Note:", mL, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const noteText = "In Case of any changes in your Contact Information, You have to inform to the General Secretary of DKMO Immediately.";
  const noteLines = doc.splitTextToSize(noteText, cW);
  doc.text(noteLines, mL, y);
  y += noteLines.length * 4 + 2;

  // ── REFERENCE MEMBER GREEN BOX ───────────────────────────────────────────────
  if (form.refMemberName || form.refMemberId) {
    const boxH = 22;
    doc.setFillColor(...lightGreen);
    doc.setDrawColor(...green);
    doc.setLineWidth(0.6);
    doc.roundedRect(mL, y, cW, boxH, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...green);
    doc.text("Reference Member", mL + 3, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(`Member Name:  ${form.refMemberName || "______________________"}`, mL + 3, y + 10);
    doc.text(`Member ID:      ${form.refMemberId || "______________________"}`, mL + 3, y + 15);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...grey);
    doc.text("This member referred me to join DKMO Membership.", mL + 3, y + 20);

    y += boxH + 4;
  }

  doc.setLineWidth(0.3);
  doc.setDrawColor(...lgrey);
  doc.line(mL, y, mR, y);
  y += 4;

  // ── PHOTO BOX ───────────────────────────────────────────────────────────────
  const photoX = mR - 30;
  const photoY = y;
  const photoW = 28;
  const photoH = 35;
  if (form.photoDataUrl) {
    doc.addImage(form.photoDataUrl, "JPEG", photoX, photoY, photoW, photoH);
  } else {
    doc.setFillColor(255, 250, 220);
    doc.setDrawColor(...lgrey);
    doc.rect(photoX, photoY, photoW, photoH, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...lgrey);
    doc.text("Affix Passport", photoX + photoW / 2, photoY + photoH / 2 - 2, { align: "center" });
    doc.text("size Photo", photoX + photoW / 2, photoY + photoH / 2 + 3, { align: "center" });
  }

  const mainW = cW - photoW - 4;

  // ── PERSONAL INFO ────────────────────────────────────────────────────────────
  function fieldLine(label: string, value: string, x: number, lineY: number, w: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text(label, x, lineY - 1);
    doc.setTextColor(...black);
    doc.setDrawColor(...lgrey);
    doc.line(x, lineY, x + w, lineY);
    if (value) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(value, x, lineY - 0.5, { maxWidth: w - 1 });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("Full Name of the Applicant", mL, y - 1);
  doc.setDrawColor(...lgrey);
  doc.line(mL, y + 3, mL + mainW, y + 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...black);
  doc.text(form.fullName || "", mL, y + 2.5, { maxWidth: mainW - 1 });
  y += 9;

  // Two-column row: DOB | Passport
  const colW = mainW / 2 - 2;
  fieldLine("Date of Birth", form.dateOfBirth || "", mL, y + 4, colW);
  fieldLine("Passport No.", form.passportNumber || "", mL + colW + 4, y + 4, colW);
  y += 12;

  // Occupation | Iqama
  fieldLine("Occupation / Job Title", form.occupation || "", mL, y + 4, colW);
  fieldLine("Iqama No.", form.iqamaNumber || "", mL + colW + 4, y + 4, colW);
  y += 12;

  // Company (full width)
  fieldLine("Company / Employer Name", form.companyName || "", mL, y + 4, mainW);
  y += 12;

  // Marital Status | Num Dependents
  const msDOB = form.maritalStatus ? form.maritalStatus : "";
  const famLabel = form.familyInSaudi ? `Family in Saudi: ${form.familyInSaudi}` : "";
  fieldLine("Marital Status (single / married)", msDOB, mL, y + 4, colW);
  fieldLine("Is the family living in Saudi (Yes / No)", form.familyInSaudi || "", mL + colW + 4, y + 4, colW);
  y += 12;

  // Blood Group
  fieldLine("Blood Group", form.bloodGroup || "", mL + colW + 4, y + 4, colW);
  y += 12;

  // ── CONTACT TABLE ────────────────────────────────────────────────────────────
  y = Math.max(y, photoY + photoH + 4);

  doc.setLineWidth(0.4);
  doc.setDrawColor(...black);
  const leftW = cW / 2;
  const rightW = cW / 2;

  // Header row
  doc.setFillColor(230, 240, 230);
  doc.rect(mL, y, leftW, 7, "F");
  doc.rect(mL + leftW, y, rightW, 7, "F");
  doc.rect(mL, y, cW, 7);
  doc.line(mL + leftW, y, mL + leftW, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Contact details in Saudi Arabia", mL + leftW / 2, y + 4.5, { align: "center" });
  doc.text("Contact details in India", mL + leftW + rightW / 2, y + 4.5, { align: "center" });
  y += 7;

  const contactRowH = 10;
  const contactRows = [
    ["Area / Location you located", form.areaSaudi || "", "Name of Home/House", form.houseName || ""],
    ["P.O. Box No. & Pin Code No.", form.poBox || "", "Postal details", form.postalAddress || ""],
    ["Business Tel. No.", form.businessPhone || "", "District Name and nearest Jama'at", `${form.district || ""}${form.nearestJamaath ? " / " + form.nearestJamaath : ""}`],
    ["Mobile No.", form.mobileSaudi || "", "Home Tel. No.", form.homePhone || ""],
    ["Email ID", form.email || "", "Mobile No.", form.mobileIndia || ""],
    ["Contact person's name & mobile no. in case of emergency", `${form.emergencyNameSaudi || ""} ${form.emergencyMobileSaudi || ""}`.trim(), "Contact person's name & mobile no. in case of emergency", `${form.emergencyNameIndia || ""} ${form.emergencyMobileIndia || ""}`.trim()],
  ];

  for (const [lLabel, lVal, rLabel, rVal] of contactRows) {
    doc.setLineWidth(0.3);
    doc.rect(mL, y, leftW, contactRowH);
    doc.rect(mL + leftW, y, rightW, contactRowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...grey);
    doc.text(doc.splitTextToSize(lLabel!, leftW - 3), mL + 1.5, y + 2.5);
    doc.text(doc.splitTextToSize(rLabel!, rightW - 3), mL + leftW + 1.5, y + 2.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    if (lVal) doc.text(String(lVal), mL + 1.5, y + 7, { maxWidth: leftW - 3 });
    if (rVal) doc.text(String(rVal), mL + leftW + 1.5, y + 7, { maxWidth: rightW - 3 });
    y += contactRowH;
  }
  y += 4;

  // ── DEPENDANTS TABLE ─────────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 14; }

  doc.setFillColor(230, 240, 230);
  doc.rect(mL, y, cW, 7, "F");
  doc.rect(mL, y, cW, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Dependants details", mL + 2, y + 4.5);
  y += 7;

  const depCols = [{ label: "Name", w: cW * 0.55 }, { label: "Age", w: cW * 0.2 }, { label: "Relationship", w: cW * 0.25 }];
  let cx = mL;
  for (const c of depCols) {
    doc.setFillColor(245, 248, 245);
    doc.rect(cx, y, c.w, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    doc.text(c.label, cx + c.w / 2, y + 4, { align: "center" });
    cx += c.w;
  }
  y += 6;

  const maxDep = 7;
  for (let i = 0; i < maxDep; i++) {
    const dep = dependents[i];
    cx = mL;
    for (const c of depCols) {
      doc.rect(cx, y, c.w, 8);
      if (dep) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...black);
        const val = c.label === "Name" ? dep.fullName || "" : c.label === "Age" ? String(dep.age ?? "") : dep.relation || "";
        if (val) doc.text(val, cx + 1.5, y + 5, { maxWidth: c.w - 3 });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...lgrey);
        doc.text(`${i + 1})`, cx + 1.5, y + 5);
      }
      cx += c.w;
    }
    y += 8;
  }
  y += 4;

  // ── NOTES ────────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("Any other details, if any", mL, y);
  y += 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text("(If you are not willing to avail contribution, please mention so herein)", mL, y);
  y += 3;
  if (form.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    const noteLines = doc.splitTextToSize(form.notes, cW);
    doc.text(noteLines, mL, y);
    y += noteLines.length * 4;
  }
  doc.setDrawColor(...lgrey);
  doc.line(mL, y + 4, mR, y + 4);
  y += 10;

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  if (y > 260) { doc.addPage(); y = 14; }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text(`Submitted: ${submissionDate}`, mR, y, { align: "right" });
  y += 8;

  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mL + 60, y);
  doc.line(mR - 80, y, mR, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("Applicant's Signature & date", mL, y);
  doc.text("Signature of President/ General Secretary-OKMO", mR, y, { align: "right" });

  doc.save(`DKMO-Membership-${dkmoNumber}-${form.fullName.replace(/\s+/g, "-")}.pdf`);
}
