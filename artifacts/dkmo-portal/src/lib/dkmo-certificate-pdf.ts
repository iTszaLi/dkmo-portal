import jsPDF from "jspdf";
import QRCode from "qrcode";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface DkmoCertificateData {
  /** DKMO number, used as both the membership number and the application reference. */
  dkmoNumber: string;
  fullName: string;
  mobile?: string | null;
  photoUrl?: string | null;
  /** ISO date string of approval. */
  approvedAt?: string | null;
  /** Fallback date if approval timestamp is missing (e.g. legacy records). */
  createdAt?: string | null;
  /** Unique certificate serial, e.g. CERT-DKMO-2026-000010. */
  certificateNumber?: string | null;
  /** Permanent approval audit reference id. */
  approvalReferenceId?: string | null;
  /** Display name of the admin who approved the application. */
  approvedByName?: string | null;
}

export interface CertificateOptions {
  /** "save" downloads the file; "print" opens the browser print dialog. Default "save". */
  output?: "save" | "print";
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Draws an official "APPROVED BY DKMO" rubber-stamp onto a canvas and returns a
 * PNG data URL. Canvas is used (rather than jsPDF vector text) because it gives
 * reliable curved/arc text for the outer ring. Colors: DKMO green ring + gold
 * accents. The art is drawn fully opaque here; transparency is applied when the
 * stamp is placed into the PDF via the graphics state.
 */
async function makeApprovalStampDataUrl(stamp: {
  certificateNumber: string;
  membershipNumber: string;
  approvalDate: string;
  /** DKMO logo as a data URL (optional — stamp renders fine without it). */
  logoDataUrl?: string | null;
}): Promise<string> {
  // High-resolution canvas so the stamp stays crisp when printed from the PDF.
  const S = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const cx = S / 2;
  const cy = S / 2;
  const green = "#15803d";
  const gold = "#b8860b";
  const FONT = "Helvetica, Arial, sans-serif";

  ctx.clearRect(0, 0, S, S);

  // ── Rings ────────────────────────────────────────────────────────────────
  const ring = (r: number, width: number, color: string) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(556, 26, green); // outer thick green ring
  ring(524, 6, gold); //  gold accent just inside it
  ring(396, 6, gold); //  gold ring separating the text band from the core
  ring(382, 10, green); // green ring around the inner core

  // ── Curved text (proportional spacing, always upright & left→right) ──────
  // centerAngle: -PI/2 = top of the circle, PI/2 = bottom (canvas y grows down).
  const arcText = (
    text: string,
    radius: number,
    centerAngle: number,
    fontPx: number,
    position: "top" | "bottom",
    letterSpacing = 6,
  ) => {
    ctx.save();
    ctx.fillStyle = green;
    ctx.font = `bold ${fontPx}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const widths = [...text].map((ch) => ctx.measureText(ch).width + letterSpacing);
    const totalAngle = widths.reduce((s, w) => s + w, 0) / radius;
    // Top text is read clockwise (angles increase); bottom text must be laid
    // counter-clockwise (angles decrease) so it still reads left→right with
    // every glyph upright — this is what fixes the mirrored/upside-down look.
    let a = position === "top" ? centerAngle - totalAngle / 2 : centerAngle + totalAngle / 2;
    for (let i = 0; i < text.length; i++) {
      const half = widths[i]! / (2 * radius);
      const mid = position === "top" ? a + half : a - half;
      ctx.save();
      ctx.translate(cx + radius * Math.cos(mid), cy + radius * Math.sin(mid));
      ctx.rotate(position === "top" ? mid + Math.PI / 2 : mid - Math.PI / 2);
      ctx.fillText(text[i]!, 0, 0);
      ctx.restore();
      a = position === "top" ? a + 2 * half : a - 2 * half;
    }
    ctx.restore();
  };

  // Outer ring text band (between the gold rings, radius ~460)
  arcText("DAKSHINA KARNATAKA MUSLIM OKKOOTA", 460, -Math.PI / 2, 58, "top");
  arcText("DKMO RIYADH", 468, Math.PI / 2, 58, "bottom", 10);

  // Gold separator stars between the two arcs (left + right, on the band)
  ctx.fillStyle = gold;
  ctx.font = `bold 60px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", cx - 460, cy + 10);
  ctx.fillText("★", cx + 460, cy + 10);

  // ── Inner core ───────────────────────────────────────────────────────────
  // DKMO logo emblem at the top of the core
  const logoR = 88;
  const logoCy = cy - 236;
  if (stamp.logoDataUrl) {
    const img = await new Promise<HTMLImageElement | null>((res) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => res(null);
      el.src = stamp.logoDataUrl!;
    });
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, logoCy, logoR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - logoR, logoCy - logoR, logoR * 2, logoR * 2);
      ctx.restore();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, logoCy, logoR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Green approval check badge (bottom-right of the logo)
  const badgeR = 44;
  const bx = cx + logoR - 8;
  const by = logoCy + logoR - 8;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(bx, by, badgeR + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = green;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(bx - 20, by + 2);
  ctx.lineTo(bx - 5, by + 17);
  ctx.lineTo(bx + 23, by - 15);
  ctx.stroke();

  // Font autosizer for values so long serials never overflow the core.
  const fitFont = (text: string, maxWidth: number, startPx: number) => {
    let px = startPx;
    ctx.font = `bold ${px}px ${FONT}`;
    while (px > 20 && ctx.measureText(text).width > maxWidth) {
      px -= 2;
      ctx.font = `bold ${px}px ${FONT}`;
    }
  };

  // "APPROVED BY DKMO" heading
  ctx.fillStyle = green;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont("APPROVED BY DKMO", 560, 62);
  ctx.fillText("APPROVED BY DKMO", cx, cy - 96);

  // Gold divider under the heading
  ctx.strokeStyle = gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 180, cy - 54);
  ctx.lineTo(cx + 180, cy - 54);
  ctx.stroke();

  // ── Certificate details (label over value, evenly spaced) ────────────────
  const dataLine = (label: string, value: string, y: number) => {
    ctx.fillStyle = gold;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(label, cx, y);
    ctx.fillStyle = green;
    fitFont(value, 520, 42);
    ctx.fillText(value, cx, y + 44);
  };
  dataLine("CERTIFICATE No.", stamp.certificateNumber || "—", cy - 8);
  dataLine("MEMBERSHIP No.", stamp.membershipNumber || "—", cy + 106);
  dataLine("APPROVED ON", stamp.approvalDate || "—", cy + 220);

  return canvas.toDataURL("image/png");
}

/**
 * Generates the official DKMO Certificate of Membership. This must only be called
 * with data sourced from an approved application record. It renders an A4 portrait
 * document with the DKMO logo, applicant photo, membership details, a QR code that
 * links to the public verification page, a faint DKMO logo watermark, and a
 * circular "Approved by DKMO" stamp.
 */
export async function generateMembershipCertificatePdf(
  data: DkmoCertificateData,
  options?: CertificateOptions,
): Promise<void> {
  const output = options?.output ?? "save";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PW = 210;
  const PH = 297;
  const mL = 16;
  const mR = PW - 16;
  const cW = mR - mL;

  const green: [number, number, number] = [21, 128, 61];
  const darkGreen: [number, number, number] = [13, 70, 38];
  const gold: [number, number, number] = [184, 134, 11];
  const grey: [number, number, number] = [90, 90, 90];
  const black: [number, number, number] = [25, 25, 25];

  const approvalDate = data.approvedAt || data.createdAt || null;
  const verifyUrl = `${window.location.origin}${basePath}/dkmo-verify?n=${encodeURIComponent(data.dkmoNumber)}`;

  const [logoDataUrl, qrDataUrl] = await Promise.all([
    loadImageAsBase64(`${basePath}/logo-circle.png`),
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 320, errorCorrectionLevel: "M" }).catch(() => null),
  ]);

  // ── Decorative border ────────────────────────────────────────────────────
  doc.setDrawColor(...green);
  doc.setLineWidth(1.4);
  doc.rect(8, 8, PW - 16, PH - 16);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.rect(11, 11, PW - 22, PH - 22);

  // ── Watermark: faint centered DKMO logo (8–12% opacity) ──────────────────
  if (logoDataUrl) {
    const gs = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState: (s: unknown) => void }).setGState;
    if (gs && setGState) {
      setGState.call(doc, new gs({ opacity: 0.1 }));
      const wmSize = 130;
      doc.addImage(logoDataUrl, "PNG", (PW - wmSize) / 2, (PH - wmSize) / 2, wmSize, wmSize);
      setGState.call(doc, new gs({ opacity: 1 }));
    }
  }

  // ── Header ───────────────────────────────────────────────────────────────
  let y = 20;
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", PW / 2 - 13, y, 26, 26);
  y += 31;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkGreen);
  doc.text("DAKSHINA KARNATAKA MUSLIM OKKOOTA", PW / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  doc.text("Community Welfare Trust  •  Kingdom of Saudi Arabia", PW / 2, y, { align: "center" });
  y += 10;

  // Title band
  doc.setFillColor(...green);
  doc.rect(mL, y, cW, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("CERTIFICATE OF MEMBERSHIP", PW / 2, y + 8, { align: "center" });
  y += 20;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...grey);
  doc.text("This is to certify that the person named below is an approved member of DKMO.", PW / 2, y, { align: "center" });
  y += 12;

  // ── Photo ────────────────────────────────────────────────────────────────
  const photoW = 34;
  const photoH = 40;
  const photoX = mL + 4;
  const photoY = y;
  doc.setDrawColor(...green);
  doc.setLineWidth(0.6);
  if (data.photoUrl) {
    try {
      doc.addImage(data.photoUrl, "JPEG", photoX, photoY, photoW, photoH);
    } catch {
      doc.rect(photoX, photoY, photoW, photoH);
    }
    doc.rect(photoX, photoY, photoW, photoH);
  } else {
    doc.setFillColor(245, 247, 245);
    doc.rect(photoX, photoY, photoW, photoH, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...grey);
    doc.text("Photo", photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
  }

  // ── Details (to the right of photo) ──────────────────────────────────────
  const dx = photoX + photoW + 10;
  const labelColor = grey;

  function detailRow(label: string, value: string, ry: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...labelColor);
    doc.text(label.toUpperCase(), dx, ry);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...black);
    doc.text(value || "—", dx, ry + 5);
  }

  let dy = photoY + 2;
  detailRow("Member Name", data.fullName, dy);
  dy += 13;

  const half = (mR - dx) / 2;
  // Membership number + Application reference side by side
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...labelColor);
  doc.text("MEMBERSHIP NO.", dx, dy);
  doc.text("APPLICATION REF.", dx + half, dy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(data.dkmoNumber, dx, dy + 5);
  doc.setTextColor(...black);
  doc.text(data.dkmoNumber, dx + half, dy + 5);
  dy += 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...labelColor);
  doc.text("MOBILE", dx, dy);
  doc.text("STATUS", dx + half, dy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...black);
  doc.text(data.mobile || "—", dx, dy + 5);
  doc.setTextColor(...green);
  doc.text("ACTIVE", dx + half, dy + 5);

  y = Math.max(photoY + photoH, dy + 10) + 10;

  // Approval / certificate audit band
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.line(mL + 4, y, mR - 4, y);
  y += 6;

  const auditHalf = (mR - 4 - (mL + 4)) / 2;
  const auditCol2 = mL + 4 + auditHalf;
  function auditField(label: string, value: string, ax: number, ay: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text(label.toUpperCase(), ax, ay);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...black);
    doc.text(value || "—", ax, ay + 4.5);
  }
  // Certificate serial number is the headline of the audit block.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("CERTIFICATE NUMBER", mL + 4, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(data.certificateNumber || "—", mL + 4, y + 5);
  auditField("Date of Approval", fmtDate(approvalDate), auditCol2, y);
  y += 11;
  auditField("Approved By", data.approvedByName || "DKMO Administrator", mL + 4, y);
  auditField("Approval Reference", data.approvalReferenceId || "—", auditCol2, y);
  y += 13;

  // ── QR code + verification note (left) and stamp (right) ─────────────────
  const blockY = y;
  if (qrDataUrl) {
    const qrSize = 34;
    doc.addImage(qrDataUrl, "PNG", mL + 4, blockY, qrSize, qrSize);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...darkGreen);
    doc.text("Scan to verify", mL + 4 + qrSize + 6, blockY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    const note = doc.splitTextToSize(
      "Scan this QR code to confirm this membership on the official DKMO verification page.",
      cW / 2 - qrSize - 12,
    ) as string[];
    doc.text(note, mL + 4 + qrSize + 6, blockY + 14);
  }

  // Stamp (right side, overlapping toward the lower area for an authentic look)
  const stampUrl = await makeApprovalStampDataUrl({
    certificateNumber: data.certificateNumber || "",
    membershipNumber: data.dkmoNumber,
    approvalDate: fmtDate(approvalDate),
    logoDataUrl,
  });
  if (stampUrl) {
    const gs = (doc as unknown as { GState?: new (o: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState?: (s: unknown) => void }).setGState;
    const stampSize = 48;
    const stampX = mR - stampSize - 6;
    const stampY = blockY - 4;
    if (gs && setGState) {
      setGState.call(doc, new gs({ opacity: 0.88 }));
      doc.addImage(stampUrl, "PNG", stampX, stampY, stampSize, stampSize, undefined, "FAST");
      setGState.call(doc, new gs({ opacity: 1 }));
    } else {
      doc.addImage(stampUrl, "PNG", stampX, stampY, stampSize, stampSize, undefined, "FAST");
    }
  }

  // ── Signatures ───────────────────────────────────────────────────────────
  let sy = blockY + 56;
  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(mL + 8, sy, mL + 68, sy);
  doc.line(mR - 68, sy, mR - 8, sy);
  sy += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.text("President — DKMO", mL + 8, sy);
  doc.text("General Secretary — DKMO", mR - 8, sy, { align: "right" });

  // ── Digital signature note ───────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...darkGreen);
  doc.text("This document is digitally signed by DKMO.", PW / 2, PH - 24, {
    align: "center",
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text(
    "This certificate is computer-generated from the approved DKMO membership record and is valid when verified via the QR code above. Any modification invalidates the digital signature.",
    PW / 2,
    PH - 16,
    { align: "center", maxWidth: cW },
  );

  const safeName = data.fullName.replace(/\s+/g, "-");
  const fileName = `DKMO-Membership-Certificate-${data.dkmoNumber}-${safeName}.pdf`;

  // Apply the cryptographic digital signature server-side. The server signs the
  // exact bytes we send, so the downloaded/printed file carries a PAdES
  // signature that breaks if the document is altered. Signing is mandatory: the
  // document carries a visible "digitally signed by DKMO" note, so we must never
  // emit an unsigned file. If signing fails we surface an error to the caller.
  const pdfArrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  const signed = await signCertificatePdfBytes(pdfArrayBuffer, data.dkmoNumber);
  if (!signed) {
    throw new Error("The certificate could not be digitally signed. Please try again in a moment.");
  }

  const blob = new Blob([signed], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  if (output === "print") {
    const win = window.open(blobUrl, "_blank");
    if (win) win.addEventListener("load", () => win.print());
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } else {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  }
}

// Sends the generated PDF to the server for cryptographic signing and returns
// the signed bytes, or null if signing is not possible.
async function signCertificatePdfBytes(
  pdf: ArrayBuffer,
  dkmoNumber: string,
): Promise<ArrayBuffer | null> {
  const base64 = arrayBufferToBase64(pdf);
  const resp = await fetch(`${basePath}/api/dkmo/memberships/certificate/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dkmoNumber, pdf: base64 }),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { pdf?: string };
  if (!body.pdf) return null;
  return base64ToArrayBuffer(body.pdf);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}
