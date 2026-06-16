import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Canonical DKMO brand mark. Always renders the logo as a perfect circle
 * (centered + cropped). Use this component for any in-app logo placement so the
 * circular branding standard is inherited automatically. The underlying asset
 * (`/logo-circle.png`) is a pre-cropped circular version of the DKMO emblem,
 * which is also used for raster contexts that cannot use CSS (favicon, PDFs).
 */
export function DkmoLogo({
  className,
  alt = "DKMO",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={`${basePath}/logo-circle.png`}
      alt={alt}
      className={cn("rounded-full object-cover", className)}
    />
  );
}
