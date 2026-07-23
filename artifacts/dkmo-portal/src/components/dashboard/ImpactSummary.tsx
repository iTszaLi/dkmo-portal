import { useGetDashboardImpact } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR } from "@/lib/utils";
import { Sparkles, Users, HeartHandshake, Landmark, HandHelping, LifeBuoy } from "lucide-react";

/**
 * Community Impact summary — the former standalone DKMO Impact page,
 * demoted to a dashboard widget per the module cleanup.
 */
export function ImpactSummary() {
  const { data, isLoading } = useGetDashboardImpact();

  const stats: { label: string; value: string | number; icon: typeof Users; accent: string }[] = [
    { label: "Assistance Distributed", value: formatSAR(data?.totalAssistanceDistributed ?? 0), icon: Sparkles, accent: "text-amber-600 dark:text-amber-400" },
    { label: "Total Members", value: data?.totalMembers ?? 0, icon: Users, accent: "text-green-700 dark:text-green-400" },
    { label: "FRF Beneficiaries", value: data?.frfBeneficiaries ?? 0, icon: HeartHandshake, accent: "text-rose-600 dark:text-rose-400" },
    { label: "Loan Beneficiaries", value: data?.loanBeneficiaries ?? 0, icon: Landmark, accent: "text-purple-600 dark:text-purple-400" },
    { label: "Welfare Requests", value: data?.totalWelfareRequests ?? 0, icon: HandHelping, accent: "text-orange-600 dark:text-orange-400" },
    { label: "Emergency Relief", value: data?.emergencyReliefCases ?? 0, icon: LifeBuoy, accent: "text-red-600 dark:text-red-400" },
  ];

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm" data-testid="card-impact-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Community Impact
        </CardTitle>
        <CardDescription className="dark:text-slate-400">DKMO's assistance across all programs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="rounded-xl border border-green-100 dark:border-slate-800 p-3">
              <Icon className={`h-4 w-4 ${accent}`} />
              {isLoading ? (
                <Skeleton className="h-6 w-16 mt-1.5" />
              ) : (
                <p className="text-lg font-bold text-green-950 dark:text-white mt-1 truncate">{value}</p>
              )}
              <p className="text-[11px] text-green-700/70 dark:text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
