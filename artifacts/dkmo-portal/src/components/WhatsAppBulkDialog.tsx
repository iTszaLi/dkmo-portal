import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { buildWhatsAppLink, type WhatsAppTarget } from "@/lib/whatsapp";
import { CheckCircle2, ExternalLink, SkipForward } from "lucide-react";

/**
 * Guided bulk WhatsApp sender.
 *
 * Browsers block window.open calls fired from timers (pop-up blocking), so
 * "open 30 tabs on one click" silently fails. Instead, this dialog steps
 * through the recipients one by one — each "Open WhatsApp" click is a direct
 * user gesture, so the chat tab always opens.
 */
export function WhatsAppBulkDialog({
  open,
  onOpenChange,
  targets,
  title = "Send WhatsApp Reminders",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: WhatsAppTarget[];
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setSentCount(0);
    }
  }, [open]);

  const total = targets.length;
  const done = index >= total;
  const current = done ? null : targets[index];

  const openCurrent = () => {
    if (!current) return;
    window.open(buildWhatsAppLink(current.number, current.message), "_blank", "noopener");
    setSentCount((c) => c + 1);
    setIndex((i) => i + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-green-950 dark:text-green-100">{title}</DialogTitle>
          <DialogDescription>
            {done
              ? `Finished — WhatsApp opened for ${sentCount} of ${total} member${total === 1 ? "" : "s"}.`
              : `Member ${index + 1} of ${total}. Each click opens a WhatsApp chat with the reminder pre-filled — just press Send there and come back.`}
          </DialogDescription>
        </DialogHeader>

        <Progress value={total === 0 ? 100 : (index / total) * 100} className="h-2" />

        {current ? (
          <div className="rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/50 dark:bg-slate-800/50 p-4 space-y-1">
            <p className="font-semibold text-green-950 dark:text-white" data-testid="text-bulk-current-name">{current.name}</p>
            <p className="text-sm text-green-700 dark:text-slate-400">+{current.number}</p>
            <p className="text-xs text-green-700/70 dark:text-slate-500 line-clamp-3 whitespace-pre-line">{current.message}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-medium">All done!</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {done ? (
            <Button onClick={() => onOpenChange(false)} className="bg-green-700 hover:bg-green-800 text-white" data-testid="button-bulk-close">
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIndex((i) => i + 1)} data-testid="button-bulk-skip">
                <SkipForward className="h-4 w-4 mr-1" /> Skip
              </Button>
              <Button onClick={openCurrent} className="bg-green-700 hover:bg-green-800 text-white" data-testid="button-bulk-open">
                <ExternalLink className="h-4 w-4 mr-1" /> Open WhatsApp ({index + 1}/{total})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
