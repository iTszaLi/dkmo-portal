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
function makeApprovalStampDataUrl(): string {
  const S = 600;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const cx = S / 2;
  const cy = S / 2;
  const green = "#15803d";
  const gold = "#b8860b";

  ctx.clearRect(0, 0, S, S);

  // Outer thick green ring
  ctx.lineWidth = 14;
  ctx.strokeStyle = green;
  ctx.beginPath();
  ctx.arc(cx, cy, 270, 0, Math.PI * 2);
  ctx.stroke();

  // Gold accent rings (inner + outer thin)
  ctx.lineWidth = 4;
  ctx.strokeStyle = gold;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 188, 0, Math.PI * 2);
  ctx.stroke();

  // Curved text helper. centerAngle in radians (0 = east, PI/2 = south).
  function arcText(
    text: string,
    radius: number,
    centerAngle: number,
    arcSpan: number,
    fontPx: number,
    flip: boolean,
  ) {
    ctx!.save();
    ctx!.fillStyle = green;
    ctx!.font = `bold ${fontPx}px Helvetica, Arial, sans-serif`;
    ctx!.textAlign = "center";
    ctx!.textBaseline = "middle";
    const n = text.length;
    const per = arcSpan / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      const a = centerAngle - arcSpan / 2 + per * (i + 0.5);
      ctx!.save();
      ctx!.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx!.rotate(flip ? a - Math.PI / 2 : a + Math.PI / 2);
      ctx!.fillText(text[i]!, 0, 0);
      ctx!.restore();
    }
    ctx!.restore();
  }

  // Top arc (reads left→right across the top)
  arcText("DAKSHINA KARNATAKA MUSLIM OKKOOTA", 222, -Math.PI / 2, Math.PI * 1.15, 30, false);
  // Bottom arc (reads left→right across the bottom)
  arcText("OFFICIAL  •  KINGDOM OF SAUDI ARABIA", 222, Math.PI / 2, Math.PI * 0.9, 26, true);

  // Side stars
  ctx.fillStyle = gold;
  ctx.font = "bold 34px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", cx - 250, cy);
  ctx.fillText("★", cx + 250, cy);

  // Center checkmark circle
  ctx.fillStyle = green;
  ctx.beginPath();
  ctx.arc(cx, cy - 58, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 58);
  ctx.lineTo(cx - 6, cy - 44);
  ctx.lineTo(cx + 22, cy - 76);
  ctx.stroke();

  // Center text block
  ctx.fillStyle = green;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 52px Helvetica, Arial, sans-serif";
  ctx.fillText("APPROVED", cx, cy + 14);
  ctx.font = "bold 40px Helvetica, Arial, sans-serif";
  ctx.fillText("BY DKMO", cx, cy + 58);
  ctx.fillStyle = gold;
  ctx.font = "bold 22px Helvetica, Arial, sans-serif";
  ctx.fillText("VERIFIED MEMBERSHIP", cx, cy + 100);

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

  // Approval date band
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.line(mL + 4, y, mR - 4, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  doc.text("Date of Approval:", mL + 4, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...black);
  doc.text(fmtDate(approvalDate), mL + 38, y);
  y += 14;

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
  const stampUrl = makeApprovalStampDataUrl();
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

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...grey);
  doc.text(
    "This certificate is computer-generated from the approved DKMO membership record and is valid when verified via the QR code above.",
    PW / 2,
    PH - 16,
    { align: "center", maxWidth: cW },
  );

  const safeName = data.fullName.replace(/\s+/g, "-");
  if (output === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl as unknown as string, "_blank");
  } else {
    doc.save(`DKMO-Membership-Certificate-${data.dkmoNumber}-${safeName}.pdf`);
  }
}
