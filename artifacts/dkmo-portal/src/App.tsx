import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, defaultLandingForRole, type Role } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

// Pages
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import CalendarPage from "@/pages/calendar";
import Members from "@/pages/members";
import MemberDetail from "@/pages/member-detail";
import Payments from "@/pages/payments";
import Pending from "@/pages/pending";
import Reports from "@/pages/reports/index";
import ReportMembership from "@/pages/reports/membership";
import ReportFees from "@/pages/reports/fees";
import ReportFrf from "@/pages/reports/frf";
import ReportLoans from "@/pages/reports/loans";
import ReportLoanRecovery from "@/pages/reports/loan-recovery";
import ReportFrfFees from "@/pages/reports/frf-fees";
import ReportFinancial from "@/pages/reports/financial-summary";
import Sponsors from "@/pages/sponsors";
import SponsorDetail from "@/pages/sponsor-detail";
import Events from "@/pages/events";
import EventDetail from "@/pages/event-detail";
import Tasks from "@/pages/tasks";
import TaskDetail from "@/pages/task-detail";
import Settings from "@/pages/settings";
import Committee from "@/pages/committee";
import CommitteePerformance from "@/pages/committee-performance";
import Meetings from "@/pages/meetings";
import Frf from "@/pages/frf";
import FrfClaimDetail from "@/pages/frf-claim-detail";
import FrfReminders from "@/pages/frf-reminders";
import CommunityServices from "@/pages/community-services";
import WelfareService from "@/pages/welfare-service";
import DkmoApply from "@/pages/dkmo-apply";
import DkmoTrack from "@/pages/dkmo-track";
import DkmoTerms from "@/pages/dkmo-terms";
import DkmoVerify from "@/pages/dkmo-verify";
import DkmoMemberships from "@/pages/dkmo-memberships";
import DkmoDuplicates from "@/pages/dkmo-duplicates";
import Loans from "@/pages/loans";
import Receipts from "@/pages/receipts";
import Documents from "@/pages/documents";
import Audit from "@/pages/audit";
import Forbidden from "@/pages/forbidden";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Redirect a retired route to its new home, preserving the query string
 *  (old receipt QR codes link to /print-receipts?verify=…). */
function LegacyRedirect({ to, keepQuery = false }: { to: string; keepQuery?: boolean }) {
  const suffix = keepQuery ? window.location.search : "";
  return <Redirect to={`${to}${suffix}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && /401|Unauthorized/i.test(error.message)) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

function FullPageSpinner() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      <div className="flex items-center gap-3 text-green-800">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-300 border-t-green-800" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}

function HomeRedirect() {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated || !user) return <Redirect to="/login" />;
  return <Redirect to={defaultLandingForRole(user.role)} />;
}

function LoginRoute() {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated && user) return <Redirect to={defaultLandingForRole(user.role)} />;
  return <LoginPage />;
}

function AuthenticatedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType;
  roles?: Role[];
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated || !user) return <Redirect to="/login" />;
  if (roles && !roles.includes(user.role)) {
    return (
      <AppLayout>
        <Forbidden />
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={LoginRoute} />
      {/* Public routes — no auth required */}
      <Route path="/dkmo-apply" component={DkmoApply} />
      <Route path="/dkmo-track" component={DkmoTrack} />
      <Route path="/dkmo-terms" component={DkmoTerms} />
      <Route path="/dkmo-verify" component={DkmoVerify} />
      {/* Backwards-compat: redirect old Clerk paths to /login */}
      <Route path="/sign-in/:rest*" component={() => <Redirect to="/login" />} />
      <Route path="/sign-up/:rest*" component={() => <Redirect to="/login" />} />

      <Route path="/dashboard" component={() => <AuthenticatedRoute component={Dashboard} />} />
      <Route path="/calendar" component={() => <AuthenticatedRoute component={CalendarPage} />} />
      <Route path="/members" component={() => <AuthenticatedRoute component={Members} />} />
      <Route path="/members/:id" component={() => <AuthenticatedRoute component={MemberDetail} />} />
      <Route path="/payments" component={() => <AuthenticatedRoute component={Payments} />} />
      <Route path="/pending" component={() => <AuthenticatedRoute component={Pending} />} />
      <Route path="/reports" component={() => <AuthenticatedRoute component={Reports} />} />
      <Route path="/reports/membership" component={() => <AuthenticatedRoute component={ReportMembership} />} />
      <Route path="/reports/fees" component={() => <AuthenticatedRoute component={ReportFees} />} />
      <Route path="/reports/frf" component={() => <AuthenticatedRoute component={ReportFrf} />} />
      <Route path="/reports/loans" component={() => <AuthenticatedRoute component={ReportLoans} />} />
      <Route path="/reports/loan-recovery" component={() => <AuthenticatedRoute component={ReportLoanRecovery} />} />
      <Route path="/reports/frf-fees" component={() => <AuthenticatedRoute component={ReportFrfFees} />} />
      <Route path="/reports/committee-performance" component={() => <AuthenticatedRoute component={CommitteePerformance} />} />
      <Route path="/reports/financial-summary" component={() => <AuthenticatedRoute component={ReportFinancial} />} />
      <Route path="/recruitment-leaderboard" component={() => <LegacyRedirect to="/members?referrals=1" />} />
      <Route path="/top-contributors" component={() => <LegacyRedirect to="/members?referrals=1" />} />

      <Route path="/sponsors" component={() => <AuthenticatedRoute component={Sponsors} />} />
      <Route path="/sponsors/:id" component={() => <AuthenticatedRoute component={SponsorDetail} />} />
      <Route path="/events" component={() => <AuthenticatedRoute component={Events} />} />
      <Route path="/events/:id" component={() => <AuthenticatedRoute component={EventDetail} />} />
      <Route path="/tasks" component={() => <AuthenticatedRoute component={Tasks} />} />
      <Route path="/tasks/:id" component={() => <AuthenticatedRoute component={TaskDetail} />} />
      <Route path="/impact" component={() => <LegacyRedirect to="/dashboard" />} />
      <Route path="/committee" component={() => <AuthenticatedRoute component={Committee} />} />
      <Route path="/committee-performance" component={() => <LegacyRedirect to="/reports/committee-performance" keepQuery />} />
      <Route path="/meetings" component={() => <AuthenticatedRoute component={Meetings} />} />
      <Route path="/services" component={() => <AuthenticatedRoute component={CommunityServices} />} />
      <Route path="/services/:type" component={() => <AuthenticatedRoute component={WelfareService} />} />
      <Route path="/frf" component={() => <AuthenticatedRoute component={Frf} />} />
      <Route path="/frf/reminders" component={() => <AuthenticatedRoute component={FrfReminders} />} />
      <Route path="/frf/:id" component={() => <AuthenticatedRoute component={FrfClaimDetail} />} />
      <Route path="/dkmo-memberships" component={() => <AuthenticatedRoute component={DkmoMemberships} />} />
      <Route path="/duplicates" component={() => <AuthenticatedRoute component={DkmoDuplicates} roles={["admin"]} />} />
      <Route path="/loans" component={() => <AuthenticatedRoute component={Loans} />} />
      <Route path="/receipts" component={() => <AuthenticatedRoute component={Receipts} />} />
      <Route path="/print-receipts" component={() => <LegacyRedirect to="/receipts" keepQuery />} />
      <Route path="/documents" component={() => <AuthenticatedRoute component={Documents} />} />
      <Route
        path="/audit"
        component={() => <AuthenticatedRoute component={Audit} roles={["admin", "finance"]} />}
      />
      <Route
        path="/settings"
        component={() => <AuthenticatedRoute component={Settings} roles={["admin"]} />}
      />
      <Route path="/forbidden" component={() => <AuthenticatedRoute component={Forbidden} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <WouterRouter base={basePath}>
              <AppRoutes />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
