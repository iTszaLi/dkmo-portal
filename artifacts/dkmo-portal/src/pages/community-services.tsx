import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, HeartHandshake, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_TYPES, SERVICE_CONFIG } from "@/lib/welfare-config";

export default function CommunityServicesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Community Services</h1>
        <p className="text-green-800/70 dark:text-slate-400 mt-1 max-w-2xl">
          DKMO welfare programs supporting members and their families in times of need. Select a service to manage requests through the unified review workflow.
        </p>
      </div>

      {/* Welfare services */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-green-700/70 dark:text-slate-500 mb-3">Welfare Programs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_TYPES.map((type) => {
            const c = SERVICE_CONFIG[type];
            const Icon = c.icon;
            return (
              <Link key={type} href={`/services/${type}`}>
                <Card className="group rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer h-full">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", c.tile)}>
                        <Icon className={cn("h-5 w-5", c.accent)} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-green-300 dark:text-slate-600 group-hover:text-green-600 dark:group-hover:text-green-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <h3 className="font-semibold text-green-950 dark:text-slate-100">{c.label}</h3>
                    <p className="text-sm text-green-700/70 dark:text-slate-400 mt-1 flex-1">{c.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Linked financial programs */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-green-700/70 dark:text-slate-500 mb-3">Financial Programs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/frf">
            <Card className="group rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer h-full">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/40">
                    <HeartHandshake className="h-5 w-5 text-green-700 dark:text-green-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] dark:bg-slate-800 dark:text-slate-400">Existing</Badge>
                </div>
                <h3 className="font-semibold text-green-950 dark:text-slate-100">FRF Claims</h3>
                <p className="text-sm text-green-700/70 dark:text-slate-400 mt-1 flex-1">Family Relief Fund death-benefit claims for registered members.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/loans">
            <Card className="group rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer h-full">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/40">
                    <Landmark className="h-5 w-5 text-blue-700 dark:text-blue-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] dark:bg-slate-800 dark:text-slate-400">Existing</Badge>
                </div>
                <h3 className="font-semibold text-green-950 dark:text-slate-100">Interest-Free Loans</h3>
                <p className="text-sm text-green-700/70 dark:text-slate-400 mt-1 flex-1">Qard-e-Hasana benevolent loans with repayment tracking.</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
