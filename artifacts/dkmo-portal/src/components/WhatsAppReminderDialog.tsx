import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buildWhatsAppLink, normalizeWhatsAppNumber } from "@/lib/whatsapp";

export type WhatsAppReminderLanguage = "en" | "kn";

export function WhatsAppReminderDialog({
  open,
  onOpenChange,
  recipientName,
  mobileNumber,
  messageForLanguage,
  title = "Send WhatsApp Reminder",
  description = "Choose a language, review the exact message, and then open WhatsApp.",
  actionLabel = "Open WhatsApp",
  testIdPrefix = "whatsapp-reminder",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  mobileNumber: string | null | undefined;
  messageForLanguage: (language: WhatsAppReminderLanguage) => string;
  title?: string;
  description?: string;
  actionLabel?: string;
  testIdPrefix?: string;
}) {
  const [language, setLanguage] = useState<WhatsAppReminderLanguage>("en");
  const normalizedNumber = useMemo(() => normalizeWhatsAppNumber(mobileNumber), [mobileNumber]);
  const message = messageForLanguage(language);

  useEffect(() => {
    if (open) setLanguage("en");
  }, [open]);

  const openWhatsApp = () => {
    if (!normalizedNumber) return;
    window.open(buildWhatsAppLink(normalizedNumber, message), "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <MessageSquare className="h-5 w-5 text-[#128C7E]" />
            {title} — {recipientName}
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium text-emerald-900 dark:text-slate-200">Recipient mobile</p>
            <p className="text-emerald-700 dark:text-slate-400">{mobileNumber || "No number provided"}</p>
            {!normalizedNumber && (
              <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">
                No WhatsApp/mobile number available.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message language</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Message language">
              <Button
                type="button"
                variant={language === "en" ? "default" : "outline"}
                onClick={() => setLanguage("en")}
                className={language === "en" ? "bg-emerald-700 hover:bg-emerald-800" : "dark:border-slate-700 dark:text-slate-300"}
                data-testid={`${testIdPrefix}-language-en`}
              >
                English
              </Button>
              <Button
                type="button"
                variant={language === "kn" ? "default" : "outline"}
                onClick={() => setLanguage("kn")}
                className={language === "kn" ? "bg-emerald-700 hover:bg-emerald-800" : "dark:border-slate-700 dark:text-slate-300"}
                data-testid={`${testIdPrefix}-language-kn`}
              >
                ಕನ್ನಡ
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {message}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-slate-700 dark:text-slate-300">
            Cancel
          </Button>
          <Button
            onClick={openWhatsApp}
            disabled={!normalizedNumber}
            className="bg-[#25D366] text-white hover:bg-[#128C7E]"
            data-testid={`${testIdPrefix}-open`}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}