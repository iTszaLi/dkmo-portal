import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { db } from "@workspace/db";
import { appSigningKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SIGNING_PURPOSE = "dkmo_certificate";
// The PKCS#12 bundle is created and consumed in-process only; this passphrase
// never leaves the server and is not a stored secret.
const P12_PASSPHRASE = "dkmo-internal-cert-signing";

interface SigningKey {
  privateKeyPem: string;
  certPem: string;
}

let cached: SigningKey | null = null;

function generateSelfSignedKey(): SigningKey {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);
  const attrs = [
    { name: "commonName", value: "DKMO" },
    { name: "organizationName", value: "Dakshina Karnataka Muslim Okkoota" },
    { shortName: "OU", value: "Membership Certification" },
    { name: "countryName", value: "SA" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
  };
}

// Loads the DKMO signing key from the database, generating and persisting it on
// first use. Cached in memory for the lifetime of the process.
async function getSigningKey(): Promise<SigningKey> {
  if (cached) return cached;

  const [existing] = await db
    .select()
    .from(appSigningKeysTable)
    .where(eq(appSigningKeysTable.purpose, SIGNING_PURPOSE));
  if (existing) {
    cached = { privateKeyPem: existing.privateKeyPem, certPem: existing.certPem };
    return cached;
  }

  const generated = generateSelfSignedKey();
  try {
    await db.insert(appSigningKeysTable).values({
      purpose: SIGNING_PURPOSE,
      privateKeyPem: generated.privateKeyPem,
      certPem: generated.certPem,
    });
    cached = generated;
    return cached;
  } catch {
    // A concurrent request may have inserted the key first; re-read it so every
    // process converges on the same key material.
    const [row] = await db
      .select()
      .from(appSigningKeysTable)
      .where(eq(appSigningKeysTable.purpose, SIGNING_PURPOSE));
    if (!row) throw new Error("Failed to persist signing key");
    cached = { privateKeyPem: row.privateKeyPem, certPem: row.certPem };
    return cached;
  }
}

function toP12Buffer(key: SigningKey): Buffer {
  const privateKey = forge.pki.privateKeyFromPem(key.privateKeyPem);
  const cert = forge.pki.certificateFromPem(key.certPem);
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], P12_PASSPHRASE, {
    algorithm: "3des",
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(der, "binary");
}

// Cryptographically signs a PDF (PAdES). The signature covers the whole byte
// range, so any later modification of the PDF invalidates it. Returns the signed
// PDF bytes.
export async function signCertificatePdf(
  pdfBuffer: Buffer,
  meta: { certificateNumber: string; membershipNumber: string },
): Promise<Buffer> {
  const key = await getSigningKey();
  const p12Buffer = toP12Buffer(key);

  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: `DKMO Membership Certificate ${meta.certificateNumber}`,
    contactInfo: "dkmo",
    name: "Dakshina Karnataka Muslim Okkoota (DKMO)",
    location: `Membership ${meta.membershipNumber}`,
  });

  const signer = new P12Signer(p12Buffer, { passphrase: P12_PASSPHRASE });
  const signed = await new SignPdf().sign(withPlaceholder, signer);
  return Buffer.isBuffer(signed) ? signed : Buffer.from(signed);
}
