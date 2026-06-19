import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle, XCircle, Clock, Search, Loader2, ArrowLeft, RefreshCw, MessageCircle,
  Download, Printer, ShieldCheck, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { generateMembershipCertificatePdf } from "@/lib/dkmo-certificate-pdf";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppStatus = "submitted" | "under_review" | "approved" | "rejected" | "completed";

interface TrackResult {
  dkmoNumber: string;
  fullName: string;
  status: AppStatus;
  declineReason: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<AppStatus, {
  label: string;
  description: string;
  icon: React.ReactNode;
  cardClass: string;
  badgeClass: string;
  dot: string;
}> = {
  submitted: {
    label: "Pending Approval",
    description: "Your application has been received and is awaiting review by DKMO.",
    icon: <Clock className="h-10 w-10 text-amber-500 dark:text-amber-400" />,
    cardClass: "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  under_review: {
    label: "Under Review",
    description: "Your application is currently being reviewed by the DKMO committee.",
    icon: <Clock className="h-10 w-10 text-yellow-500 dark:text-yellow-400" />,
    cardClass: "border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/10",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    dot: "bg-yellow-500",
  },
  approved: {
    label: "Approved",
    description: "Congratulations! Your DKMO membership application has been approved. DKMO will be in touch shortly.",
    icon: <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />,
    cardClass: "border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/10",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    dot: "bg-green-500",
  },
  completed: {
    label: "Completed",
    description: "Your DKMO membership is active. Welcome to the DKMO family!",
    icon: <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />,
    cardClass: "border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/10",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    dot: "bg-green-500",
  },
  rejected: {
    label: "Declined",
    description: "Unfortunately your application was not approved at this time. Please contact the DKMO General Secretary for more information or to reapply.",
    icon: <XCircle className="h-10 w-10 text-red-500 dark:text-red-400" />,
    cardClass: "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function DkmoTrackPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<"dkmoNumber" | "mobile">("dkmoNumber");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TrackResult[] | null>(null);
  const [certBusy, setCertBusy] = useState<string | null>(null);

  async function handleCertificate(dkmoNumber: string, output: "save" | "print") {
    setCertBusy(`${dkmoNumber}:${output}`);
    try {
      const res = await fetch(
        `${basePath}/api/dkmo/memberships/certificate?dkmoNumber=${encodeURIComponent(dkmoNumber)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Certificate is not available yet.");
      }
      const data = await res.json();
      await generateMembershipCertificatePdf(
        {
          dkmoNumber: data.dkmoNumber,
          fullName: data.fullName,
          mobile: data.mobile,
          photoUrl: data.photoUrl,
          approvedAt: data.approvedAt,
          createdAt: data.createdAt,
        },
        { output },
      );
    } catch (err) {
      toast({
        title: "Unable to generate certificate",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCertBusy(null);
    }
  }

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const param = queryType === "dkmoNumber" ? `dkmoNumber=${encodeURIComponent(q)}` : `mobile=${encodeURIComponent(q)}`;
      const res = await fetch(`${basePath}/api/dkmo/memberships/track?${param}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error || "Lookup failed");
      }
      const data = await res.json() as TrackResult[];
      if (!data.length) {
        setError("No application found. Please check your DKMO number or mobile number and try again.");
      } else {
        setResults(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      {/* Header */}
      <div className="border-b border-green-100 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => setLocation(`${basePath}/login`)}
            className="text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-200 p-1 rounded-lg hover:bg-green-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-green-950 dark:text-green-100">Check Application Status</h1>
            <p className="text-xs text-green-700/60 dark:text-slate-400">DKMO — Membership Application</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Search Card */}
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
              <Search className="h-5 w-5" />
              Look up your application
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">
              Enter your DKMO application number or the mobile number you registered with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              {/* Toggle */}
              <div className="flex rounded-xl border border-green-200 dark:border-slate-700 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => { setQueryType("dkmoNumber"); setResults(null); setError(null); }}
                  className={`flex-1 py-2 font-medium transition-colors ${queryType === "dkmoNumber" ? "bg-green-800 text-white" : "bg-transparent text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"}`}
                >
                  DKMO Number
                </button>
                <button
                  type="button"
                  onClick={() => { setQueryType("mobile"); setResults(null); setError(null); }}
                  className={`flex-1 py-2 font-medium transition-colors ${queryType === "mobile" ? "bg-green-800 text-white" : "bg-transparent text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"}`}
                >
                  Mobile Number
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="track-query" className="text-sm text-green-900 dark:text-slate-300">
                  {queryType === "dkmoNumber" ? "DKMO Application Number" : "Registered Mobile Number"}
                </Label>
                <Input
                  id="track-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={queryType === "dkmoNumber" ? "e.g. DKMO-2024-0001" : "e.g. +966501234567"}
                  className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                disabled={!query.trim() || loading}
                className="w-full bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? "Searching…" : "Check Status"}
              </Button>
            </form>

            {error && (
              <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {results && results.map((r) => {
          const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.submitted;
          return (
            <Card key={r.dkmoNumber} className={`rounded-2xl shadow-sm border-2 ${cfg.cardClass}`}>
              <CardContent className="pt-6 space-y-5">
                {/* Status header */}
                <div className="flex flex-col items-center text-center gap-3">
                  <div className={`h-20 w-20 rounded-full flex items-center justify-center ${cfg.cardClass}`}>
                    {cfg.icon}
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${cfg.badgeClass}`}>
                      <span className={`h-2 w-2 rounded-full ${cfg.dot} inline-block`} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm">{cfg.description}</p>
                </div>

                {/* Approved: official membership document (gated — only shown once approved) */}
                {(r.status === "approved" || r.status === "completed") && (
                  <div className="rounded-2xl border-2 border-green-300 dark:border-green-800/60 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 p-5 animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-bold">
                      <PartyPopper className="h-5 w-5" />
                      Membership Approved by DKMO
                    </div>
                    <p className="mt-1 text-sm text-green-700/80 dark:text-green-300/70">
                      Your official membership document is now ready. Download or print your certificate below.
                    </p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        disabled={certBusy !== null}
                        onClick={() => void handleCertificate(r.dkmoNumber, "save")}
                        className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-1.5"
                      >
                        {certBusy === `${r.dkmoNumber}:save` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={certBusy !== null}
                        onClick={() => void handleCertificate(r.dkmoNumber, "print")}
                        className="border-green-400 dark:border-green-800 text-green-800 dark:text-green-300 gap-1.5"
                      >
                        {certBusy === `${r.dkmoNumber}:print` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Print PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`${basePath}/dkmo-verify?n=${encodeURIComponent(r.dkmoNumber)}`)}
                        className="border-green-400 dark:border-green-800 text-green-800 dark:text-green-300 gap-1.5"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        View Profile
                      </Button>
                    </div>
                  </div>
                )}

                <hr className="border-current opacity-10" />

                {/* Application details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Applicant</span>
                    <span className="font-semibold text-green-950 dark:text-slate-100">{r.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">DKMO Number</span>
                    <span className="font-mono font-semibold text-green-800 dark:text-green-300">{r.dkmoNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Applied on</span>
                    <span className="text-slate-700 dark:text-slate-300">{formatDate(r.createdAt)}</span>
                  </div>
                </div>

                {/* Decline reason */}
                {r.status === "rejected" && r.declineReason && (
                  <div className="rounded-xl bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4">
                    <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1 uppercase tracking-wide">Reason for declining</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{r.declineReason}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-current/20 dark:border-slate-700 text-green-800 dark:text-green-300 gap-1.5"
                    onClick={() => void handleSearch()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-green-300 dark:border-slate-700 text-green-700 dark:text-green-400 gap-1.5"
                    onClick={() => setLocation(`${basePath}/dkmo-apply`)}
                  >
                    New Application
                  </Button>
                </div>

                {/* WhatsApp contact hint */}
                <div className="flex items-start gap-2 rounded-xl bg-white/60 dark:bg-slate-800/40 border border-green-100 dark:border-slate-700 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  <MessageCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>For any queries, contact the DKMO General Secretary via WhatsApp or visit your nearest DKMO office.</span>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Footer link */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
          Don't have an application yet?{" "}
          <button
            onClick={() => setLocation(`${basePath}/dkmo-apply`)}
            className="text-green-700 dark:text-green-400 underline hover:no-underline"
          >
            Apply for DKMO Membership
          </button>
        </p>
      </div>
    </div>
  );
}
