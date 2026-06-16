import { useGetDashboardImpact } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR } from "@/lib/utils";
import {
  Users,
  HeartHandshake,
  Stethoscope,
  Landmark,
  Plane,
  LifeBuoy,
  HandHelping,
  Briefcase,
  CheckCircle2,
  Coins,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const CATEGORY_COLORS = ["#15803d", "#0ea5e9", "#9333ea", "#0d9488", "#dc2626", "#ea580c"];

const WELFARE_TYPE_LABEL: Record<string, string> = {
  medical_aid: "Medical Aid",
  air_ticket: "Air Ticket",
  emergency_response: "Emergency Relief",
  general_relief: "General Relief",
  india_rep: "India Repatriation",
};

interface MetricDef {
  key: string;
  label: string;
  icon: typeof Users;
  accent: string;
  sub: string;
}

export default function Impact() {
  const { data, isLoading } = useGetDashboardImpact();

  const metrics: { def: MetricDef; value: number }[] = [
    { def: { key: "totalMembers", label: "Total Members", icon: Users, accent: "text-green-700 dark:text-green-400", sub: "Registered community" }, value: data?.totalMembers ?? 0 },
    { def: { key: "frfBeneficiaries", label: "FRF Beneficiaries", icon: HeartHandshake, accent: "text-rose-600 dark:text-rose-400", sub: "Claims approved / disbursed" }, value: data?.frfBeneficiaries ?? 0 },
    { def: { key: "medicalAidCases", label: "Medical Aid Cases", icon: Stethoscope, accent: "text-sky-600 dark:text-sky-400", sub: "Granted" }, value: data?.medicalAidCases ?? 0 },
    { def: { key: "loanBeneficiaries", label: "Loan Beneficiaries", icon: Landmark, accent: "text-purple-600 dark:text-purple-400", sub: "Loans disbursed" }, value: data?.loanBeneficiaries ?? 0 },
    { def: { key: "airTicketBeneficiaries", label: "Air Ticket Beneficiaries", icon: Plane, accent: "text-teal-600 dark:text-teal-400", sub: "Welfare + FRF" }, value: data?.airTicketBeneficiaries ?? 0 },
    { def: { key: "emergencyReliefCases", label: "Emergency Relief", icon: LifeBuoy, accent: "text-red-600 dark:text-red-400", sub: "Cases resolved" }, value: data?.emergencyReliefCases ?? 0 },
    { def: { key: "totalWelfareRequests", label: "Welfare Requests", icon: HandHelping, accent: "text-orange-600 dark:text-orange-400", sub: "All-time submitted" }, value: data?.totalWelfareRequests ?? 0 },
    { def: { key: "jobsPosted", label: "Jobs Posted", icon: Briefcase, accent: "text-indigo-600 dark:text-indigo-400", sub: "Job bureau listings" }, value: data?.jobsPosted ?? 0 },
    { def: { key: "jobPlacements", label: "Job Placements", icon: CheckCircle2, accent: "text-emerald-600 dark:text-emerald-400", sub: "Members placed" }, value: data?.jobPlacements ?? 0 },
  ];

  const categoryData = (data?.assistanceByCategory ?? []).filter((c) => c.count > 0 || c.amount > 0);
  const welfareData = (data?.welfareByType ?? []).map((w) => ({
    name: WELFARE_TYPE_LABEL[w.type] ?? w.type,
    count: w.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">DKMO Impact</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            Organization-wide reach across every welfare and assistance program
          </p>
        </div>
        <div className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-green-700 dark:text-green-400" />
          Committed to the community
        </div>
      </div>

      {/* Total distributed hero */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 bg-gradient-to-br from-green-50 to-emerald-50/40 dark:from-slate-900 dark:to-slate-900 shadow-sm">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <Coins className="h-7 w-7 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700/80 dark:text-slate-400">Total Assistance Distributed</p>
              {isLoading ? (
                <Skeleton className="h-9 w-48 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-green-950 dark:text-green-300" data-testid="text-total-assistance">
                  {formatSAR(data?.totalAssistanceDistributed)}
                </p>
              )}
              <p className="text-xs text-green-700/70 dark:text-slate-500 mt-0.5">
                FRF + welfare approvals + loan disbursements
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(({ def, value }) => (
          <Card key={def.key} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm" data-testid={`card-impact-${def.key}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">{def.label}</CardTitle>
              <def.icon className={`h-4 w-4 ${def.accent}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-white">{value}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">{def.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-green-950 dark:text-green-100">Assistance by Category</CardTitle>
            <CardDescription className="dark:text-slate-400">Amount distributed per program (SAR)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : categoryData.length === 0 ? (
              <p className="text-sm text-green-700/70 dark:text-slate-500 py-16 text-center">No assistance recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatSAR(v)} />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-green-950 dark:text-green-100">Welfare Requests by Type</CardTitle>
            <CardDescription className="dark:text-slate-400">Distribution of all welfare requests</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : welfareData.length === 0 ? (
              <p className="text-sm text-green-700/70 dark:text-slate-500 py-16 text-center">No welfare requests yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={welfareData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e) => `${e.name}: ${e.count}`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {welfareData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
