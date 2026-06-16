import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock, ShieldCheck, User as UserIcon, Users, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { DkmoLogo } from "@/components/DkmoLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    if (!u || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(u, password);
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 overflow-hidden bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* Blobs */}
      <div
        className="pointer-events-none absolute -top-40 -left-32 h-80 w-80 rounded-full bg-green-200/50 dark:bg-green-900/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-32 h-80 w-80 rounded-full bg-orange-200/50 dark:bg-orange-900/15 blur-3xl"
        aria-hidden
      />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <a
          href={`${basePath}/frf-track`}
          className="inline-flex items-center gap-1.5 rounded-full border border-green-300 dark:border-green-800 bg-white/80 dark:bg-slate-900/80 hover:bg-green-50 dark:hover:bg-slate-800 text-green-800 dark:text-green-300 text-xs font-semibold px-3.5 py-1.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Check Status
        </a>
        <a
          href={`${basePath}/frf-apply`}
          className="inline-flex items-center gap-1.5 rounded-full text-white text-xs font-semibold px-3.5 py-1.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" style={{ backgroundColor: "#FFAC1C" }}
        >
          <Users className="h-3.5 w-3.5" />
          Apply for FRF Membership
        </a>
        <a
          href={`${basePath}/dkmo-apply`}
          className="inline-flex items-center gap-1.5 rounded-full bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3.5 py-1.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <Users className="h-3.5 w-3.5" />
          Apply for DKMO Membership
        </a>
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-green-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl overflow-hidden transition-colors duration-300">
          <div className="px-8 pt-8 pb-6 flex flex-col items-center text-center">
            <DkmoLogo className="h-20 w-20 mb-3" />
            <h1 className="text-2xl font-bold text-green-900 dark:text-green-300">DKMO Management Portal</h1>
            <p className="mt-1 text-sm text-green-700/70 dark:text-green-500/80">
              Executive sign-in only · Authorized personnel
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-800 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800/50">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure session · 30-min inactivity timeout
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-green-900 dark:text-green-300 font-medium">
                Username
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60 dark:text-green-500/60" />
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 border-green-200 dark:border-slate-700 focus-visible:border-green-700 dark:focus-visible:border-green-500 focus-visible:ring-green-700/30 dark:focus-visible:ring-green-500/30 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Enter your username"
                  disabled={submitting}
                  data-testid="input-username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-green-900 dark:text-green-300 font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60 dark:text-green-500/60" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 border-green-200 dark:border-slate-700 focus-visible:border-green-700 dark:focus-visible:border-green-500 focus-visible:ring-green-700/30 dark:focus-visible:ring-green-500/30 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Enter your password"
                  disabled={submitting}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-green-700/70 dark:text-green-500/70 hover:bg-green-50 dark:hover:bg-slate-700 hover:text-green-800 dark:hover:text-green-300 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert
                variant="destructive"
                className="bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400"
                data-testid="alert-login-error"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white h-11 text-base font-semibold shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.99]"
              disabled={submitting}
              data-testid="button-login"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in to portal"
              )}
            </Button>

            <p className="text-center text-xs text-green-700/60 dark:text-green-600/60 pt-2">
              Account creation is disabled. Contact the administrator for access.
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-green-800/60 dark:text-slate-500">
          © {new Date().getFullYear()} Dakshina Karnataka Muslim Ookota · Committed to the Community
        </p>
      </div>
    </div>
  );
}
