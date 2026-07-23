import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type MonthlyRow = { month: string; total: number; paymentCount: number };
type MethodRow = { method: string; total: number; count: number };

const PIE_COLORS = ["#059669", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

/** Dashboard trends: monthly collections, monthly new members, payment methods. */
export function TrendsCharts({ memberCreatedDates }: { memberCreatedDates: string[] | undefined }) {
  const { data: monthly, isLoading: loadingMonthly } = useQuery({
    queryKey: ["dashboard-monthly-collection", 12],
    queryFn: async (): Promise<MonthlyRow[]> => {
      const res = await fetch(`${basePath}/api/dashboard/monthly-collection?months=12`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: methods, isLoading: loadingMethods } = useQuery({
    queryKey: ["dashboard-payment-methods"],
    queryFn: async (): Promise<MethodRow[]> => {
      const res = await fetch(`${basePath}/api/dashboard/payment-method-breakdown`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  // New members per month for the last 12 months, computed from createdAt.
  const memberGrowth = useMemo(() => {
    const now = new Date();
    const buckets = new Map<string, number>();
    const out: { month: string; label: string; joined: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
      out.push({ month: key, label: monthLabel(key), joined: 0 });
    }
    for (const iso of memberCreatedDates ?? []) {
      const key = iso.slice(0, 7);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    for (const row of out) row.joined = buckets.get(row.month) ?? 0;
    return out;
  }, [memberCreatedDates]);

  const collectionData = useMemo(
    () => (monthly ?? []).map((r) => ({ ...r, label: monthLabel(r.month) })),
    [monthly],
  );
  const methodData = useMemo(
    () => (methods ?? []).filter((m) => m.total > 0).map((m) => ({
      ...m,
      name: m.method ? m.method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown",
    })),
    [methods],
  );

  const tooltipStyle = {
    borderRadius: 8,
    border: "1px solid rgb(209 250 229)",
    fontSize: 12,
  } as const;

  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Trends
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          Collections, member growth and payment channels over the last 12 months.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700/70 dark:text-slate-400">Monthly Collections</p>
            {loadingMonthly ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={collectionData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(5,150,105,0.12)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [formatSAR(Number(v)), "Collected"]} />
                  <Bar dataKey="total" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700/70 dark:text-slate-400">New Members</p>
            {!memberCreatedDates ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={memberGrowth} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(5,150,105,0.12)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "Joined"]} />
                  <Line type="monotone" dataKey="joined" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700/70 dark:text-slate-400">Payment Methods</p>
            {loadingMethods ? <Skeleton className="h-48 w-full" /> : methodData.length === 0 ? (
              <p className="py-16 text-center text-sm text-emerald-700/70 dark:text-slate-400">No payments yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={methodData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {methodData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, name) => [formatSAR(Number(v)), name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
