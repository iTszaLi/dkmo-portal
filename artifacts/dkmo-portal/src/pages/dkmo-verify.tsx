import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ShieldX, Loader2, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface VerifyResult {
  found: boolean;
  fullName?: string;
  membershipNumber?: string;
  status?: string;
  approvedAt?: string | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function DkmoVerifyPage() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [missingParam, setMissingParam] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("n");
    if (!n) {
      setMissingParam(true);
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${basePath}/api/dkmo/memberships/verify?dkmoNumber=${encodeURIComponent(n)}`);
        const data = (await res.json()) as VerifyResult;
        setResult(data);
      } catch {
        setResult({ found: false });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const verified = result?.found === true;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      <div className="max-w-md mx-auto px-4 py-12 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <img src={`${basePath}/logo-circle.png`} alt="DKMO" className="h-16 w-16 rounded-full" />
          <h1 className="text-lg font-bold text-green-950 dark:text-green-100">DKMO Membership Verification</h1>
          <p className="text-xs text-green-700/60 dark:text-slate-400">Dakshina Karnataka Muslim Okkoota</p>
        </div>

        {loading ? (
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-green-700" />
              <span className="text-sm">Verifying membership…</span>
            </CardContent>
          </Card>
        ) : verified ? (
          <Card className="rounded-2xl shadow-sm border-2 border-green-300 dark:border-green-800/60 bg-green-50/60 dark:bg-green-950/10">
            <CardContent className="pt-6 space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <ShieldCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                  Verified Active Member
                </span>
              </div>

              <hr className="border-green-200/60 dark:border-green-900/40" />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Member Name</span>
                  <span className="font-semibold text-green-950 dark:text-slate-100">{result?.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Membership Number</span>
                  <span className="font-mono font-semibold text-green-800 dark:text-green-300">{result?.membershipNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <span className="font-semibold text-green-700 dark:text-green-400 uppercase">Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Approved On</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDate(result?.approvedAt)}</span>
                </div>
              </div>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                This membership is officially recognised by DKMO.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl shadow-sm border-2 border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10">
            <CardContent className="pt-6 space-y-4 text-center">
              <div className="h-20 w-20 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ShieldX className="h-10 w-10 text-red-500 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-700 dark:text-red-300">
                {missingParam ? "No membership number provided" : "Membership could not be verified"}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {missingParam
                  ? "Scan a valid DKMO certificate QR code to verify a membership."
                  : "This membership number is not an active, approved DKMO member. Please check the number and try again."}
              </p>
            </CardContent>
          </Card>
        )}

        <Button
          variant="outline"
          className="w-full border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 gap-2"
          onClick={() => setLocation(`${basePath}/dkmo-track`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Check application status
        </Button>
      </div>
    </div>
  );
}
