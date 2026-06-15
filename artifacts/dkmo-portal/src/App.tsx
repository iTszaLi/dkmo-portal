import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, defaultLandingForRole, type Role } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

// Pages
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Members from "@/pages/members";
import MemberDetail from "@/pages/member-detail";
import Payments from "@/pages/payments";
import Pending from "@/pages/pending";
import Reports from "@/pages/reports";
import TopContributors from "@/pages/top-contributors";
import Sponsors from "@/pages/sponsors";
import SponsorDetail from "@/pages/sponsor-detail";
import Events from "@/pages/events";
import EventDetail from "@/pages/event-detail";
import Tasks from "@/pages/tasks";
import TaskDetail from "@/pages/task-detail";
import Settings from "@/pages/settings";
import Committee from "@/pages/committee";
import Frf from "@/pages/frf";
import FrfMembership from "@/pages/frf-membership";
import FrfMembershipDetail from "@/pages/frf-membership-detail";
import FrfMembershipForm from "@/pages/frf-membership-form";
import FrfApply from "@/pages/frf-apply";
import FrfTerms from "@/pages/frf-terms";
import FrfTrack from "@/pages/frf-track";
import Loans from "@/pages/loans";
import Receipts from "@/pages/receipts";
import PrintReceipts from "@/pages/print-receipts";
import Documents from "@/pages/documents";
import Forbidden from "@/pages/forbidden";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      <Route path="/frf-apply" component={FrfApply} />
      <Route path="/frf-terms" component={FrfTerms} />
      <Route path="/frf-track" component={FrfTrack} />
      {/* Backwards-compat: redirect old Clerk paths to /login */}
      <Route path="/sign-in/:rest*" component={() => <Redirect to="/login" />} />
      <Route path="/sign-up/:rest*" component={() => <Redirect to="/login" />} />

      <Route path="/dashboard" component={() => <AuthenticatedRoute component={Dashboard} />} />
      <Route path="/members" component={() => <AuthenticatedRoute component={Members} />} />
      <Route path="/members/:id" component={() => <AuthenticatedRoute component={MemberDetail} />} />
      <Route path="/payments" component={() => <AuthenticatedRoute component={Payments} />} />
      <Route path="/pending" component={() => <AuthenticatedRoute component={Pending} />} />
      <Route path="/reports" component={() => <AuthenticatedRoute component={Reports} />} />
      <Route path="/top-contributors" component={() => <AuthenticatedRoute component={TopContributors} />} />

      <Route path="/sponsors" component={() => <AuthenticatedRoute component={Sponsors} />} />
      <Route path="/sponsors/:id" component={() => <AuthenticatedRoute component={SponsorDetail} />} />
      <Route path="/events" component={() => <AuthenticatedRoute component={Events} />} />
      <Route path="/events/:id" component={() => <AuthenticatedRoute component={EventDetail} />} />
      <Route path="/tasks" component={() => <AuthenticatedRoute component={Tasks} />} />
      <Route path="/tasks/:id" component={() => <AuthenticatedRoute component={TaskDetail} />} />
      <Route path="/committee" component={() => <AuthenticatedRoute component={Committee} />} />
      <Route path="/frf" component={() => <AuthenticatedRoute component={Frf} />} />
      <Route path="/frf-membership/new" component={() => <AuthenticatedRoute component={FrfMembershipForm} />} />
      <Route path="/frf-membership/:id/edit" component={() => <AuthenticatedRoute component={FrfMembershipForm} />} />
      <Route path="/frf-membership/:id" component={() => <AuthenticatedRoute component={FrfMembershipDetail} />} />
      <Route path="/frf-membership" component={() => <AuthenticatedRoute component={FrfMembership} />} />
      <Route path="/loans" component={() => <AuthenticatedRoute component={Loans} />} />
      <Route path="/receipts" component={() => <AuthenticatedRoute component={Receipts} />} />
      <Route path="/print-receipts" component={() => <AuthenticatedRoute component={PrintReceipts} />} />
      <Route path="/documents" component={() => <AuthenticatedRoute component={Documents} />} />
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
