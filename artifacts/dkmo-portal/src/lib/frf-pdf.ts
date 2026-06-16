import jsPDF from "jspdf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface FrfPdfDependent {
  fullName?: string | null;
  age?: string | number | null;
  relation?: string | null;
}

export interface FrfPdfData {
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

export async function generateFrfPdf(
  form: FrfPdfData,
  dependents: FrfPdfDependent[],
  frfNumber: string,
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
  const lgrey: [number, number, number] = [160, 160, 160];

  const logoDataUrl = await loadImageAsBase64(`${basePath}/logo.png`);

  // ── HEADER ──────────────────────────────────────────────────────────────────
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", mL, 6, 30, 30);
  } else {
    doc.setDrawColor(...black);
    doc.setLineWidth(0.4);
    doc.rect(mL, 8, 24, 24);
    doc.setTextColor(...grey);
    doc.setFontSize(6);
    doc.text("DKMO", mL + 12, 22, { align: "center" });
  }

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

  // ── IMPORTANT NOTE ──────────────────────────────────────────────────────────
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
  y += (noteLines as string[]).length * 4.2 + 3;

  // ── REFERENCE MEMBER GREEN BOX (always shown) ────────────────────────────────
  {
    const refGreen: [number, number, number] = [30, 120, 60];
    const refLightGreen: [number, number, number] = [220, 245, 225];
    const boxH = 16;
    doc.setFillColor(...refLightGreen);
    doc.setDrawColor(...refGreen);
    doc.setLineWidth(0.5);
    doc.roundedRect(mL, y, cW, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...refGreen);
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
    doc.text(form.refMemberName || "__________________________________", mL + 27, y + 9.5, { maxWidth: colHalf });
    doc.text(form.refMemberId || "__________________________________", mL + cW / 2 + 22, y + 9.5, { maxWidth: colHalf });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...grey);
    doc.text("The DKMO member who referred me to join FRF Membership.", mL + 3, y + 14);
    y += boxH + 3;
  }

  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL, y, mR, y);
  y += 6;

  // ── PERSONAL INFO + PHOTO BOX ───────────────────────────────────────────────
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
    } catch { /* skip bad image data */ }
  } else {
    doc.setFillColor(255, 235, 80);
    doc.rect(photoX + 0.5, photoY + 0.5, photoW - 1, photoH - 1, "F");
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Affix Passport", photoX + photoW / 2, photoY + photoH / 2 - 2, { align: "center" });
    doc.text("size Photo", photoX + photoW / 2, photoY + photoH / 2 + 3, { align: "center" });
  }

  const fw = photoX - mL - 3;
  const fw2 = (fw - 3) / 2;
  const fullW2 = (cW - 3) / 2;

  const drawLine = (x: number, fy: number, w: number) => {
    doc.setDrawColor(...lgrey);
    doc.setLineWidth(0.3);
    doc.line(x, fy, x + w, fy);
  };
  const pField = (label: string, value: string | null | undefined, x: number, w: number, fy: number) => {
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

  pField("Full Name of the Applicant", form.fullName, mL, fw, y);
  y += 11;
  pField("Date of Birth", form.dateOfBirth, mL, fw2, y);
  pField("Passport No.", form.passportNumber, mL + fw2 + 3, fw2, y);
  y += 11;
  pField("Occupation / Job Title", form.occupation, mL, fw2, y);
  pField("Iqama No.", form.iqamaNumber, mL + fw2 + 3, fw2, y);
  y += 11;
  pField("Company / Employer Name", form.companyName, mL, fw, y);
  y += 11;
  pField("Marital Status (single / married)", form.maritalStatus, mL, fullW2, y);
  pField("Number of Dependents", String(dependents.length), mL + fullW2 + 3, fullW2, y);
  y += 11;
  pField("Is the family living in Saudi (Yes / No)", form.familyInSaudi, mL, fullW2, y);
  pField("Blood Group", form.bloodGroup, mL + fullW2 + 3, fullW2, y);
  y += 14;

  // ── CONTACT DETAILS ─────────────────────────────────────────────────────────
  const boxW = cW / 2;
  const boxL = mL;
  const boxR = mL + boxW;
  const rowH = 9;
  const contactData = [
    { l: "Area / Location you located",                             lv: form.areaSaudi,
      r: "Name of Home/House",                                      rv: form.houseName },
    { l: "P.O. Box No. & Pin Code No.",                            lv: form.poBox,
      r: "Postal details",                                          rv: form.postalAddress },
    { l: "Business Tel. No.",                                       lv: form.businessPhone,
      r: "District Name and nearest Jaina't",                       rv: [form.district, form.nearestJamaath].filter(Boolean).join(" / ") || null },
    { l: "Mobile No.",                                              lv: form.mobileSaudi,
      r: "Home Tel. No.",                                           rv: form.homePhone },
    { l: "Email ID",                                                lv: form.email,
      r: "Mobile No.",                                              rv: form.mobileIndia },
    { l: "Contact person's name & mobile no. in case of emergency", lv: [form.emergencyNameSaudi, form.emergencyMobileSaudi].filter(Boolean).join(" — ") || null,
      r: "Contact person's name & mobile no. in case of emergency", rv: [form.emergencyNameIndia, form.emergencyMobileIndia].filter(Boolean).join(" — ") || null },
  ];
  const hdrH = 8;
  const totalBoxH = hdrH + contactData.length * rowH;

  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(boxL, y, boxW, totalBoxH);
  doc.rect(boxR, y, boxW, totalBoxH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Contact details in Saudi Arabia", boxL + boxW / 2, y + 5.5, { align: "center" });
  doc.text("Contact details in India", boxR + boxW / 2, y + 5.5, { align: "center" });

  doc.setLineWidth(0.4);
  doc.line(boxL, y + hdrH, boxL + boxW, y + hdrH);
  doc.line(boxR, y + hdrH, boxR + boxW, y + hdrH);

  let cy = y + hdrH;
  for (let i = 0; i < contactData.length; i++) {
    const row = contactData[i];
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

  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.rect(mL, y, cW, depTotalH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...black);
  doc.text("Dependants details", mL + 2, y + 4.5);
  doc.setLineWidth(0.4);
  doc.line(mL, y + depHdrH, mR, y + depHdrH);

  let dy = y + depHdrH;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Name", mL + 2, dy + 4.2);
  doc.text("Age", mL + nameW + ageW / 2, dy + 4.2, { align: "center" });
  doc.text("Relationship", mL + nameW + ageW + relW / 2, dy + 4.2, { align: "center" });

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
    const ageVal = dep?.age != null ? String(dep.age) : "";
    const ageText = ageVal ? `( ${ageVal} )` : "(          )";
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
