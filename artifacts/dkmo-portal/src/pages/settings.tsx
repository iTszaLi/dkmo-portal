import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cog, ShieldCheck, Users } from "lucide-react";
import { useAuth, roleLabel, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";

const SEED_USERS: Array<{ username: string; role: Role; displayName: string }> = [
  { username: "admin1",   role: "admin",   displayName: "Administrator" },
  { username: "finance1", role: "finance", displayName: "Finance Lead" },
  { username: "finance2", role: "finance", displayName: "Finance Officer" },
  { username: "event",    role: "event",   displayName: "Event Manager" },
  { username: "user1",    role: "viewer",  displayName: "Viewer" },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-300 ring-1 ring-yellow-300 dark:ring-yellow-700/50",
  finance: "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700/50",
  event: "bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700/50",
  viewer: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600",
};

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-green-950 dark:text-green-100 flex items-center gap-2">
          <Cog className="h-6 w-6" /> Settings
        </h1>
        <p className="text-sm text-green-800/70 dark:text-slate-400">
          Admin-only configuration and user management.
        </p>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Users className="h-4 w-4" /> Seeded users
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Fixed seed accounts. Each uses the password{" "}
            <code className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-slate-800 text-green-900 dark:text-green-300 text-xs">
              dkmo@2026
            </code>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-green-100 dark:divide-slate-800">
            {SEED_USERS.map((u) => (
              <div key={u.username} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-medium text-green-950 dark:text-slate-200">{u.displayName}</div>
                  <div className="text-xs text-green-700/70 dark:text-slate-500">@{u.username}</div>
                </div>
                <Badge className={cn("uppercase text-[11px] tracking-wider", ROLE_BADGE[u.role])}>
                  {roleLabel(u.role)}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Role permissions
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Backend enforces these rules; the UI hides actions accordingly.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-2 text-green-900 dark:text-slate-300">
            <li>
              <strong className="dark:text-slate-100">Admin</strong> — full access, including create/edit/delete
              sponsors, payments, and settings.
            </li>
            <li>
              <strong className="dark:text-slate-100">Finance Team</strong> — view sponsors, add and edit payments. No
              deletes, no settings.
            </li>
            <li>
              <strong className="dark:text-slate-100">Event Manager</strong> — view sponsors and link them to events. No
              payment edits.
            </li>
            <li>
              <strong className="dark:text-slate-100">Viewer</strong> — read-only across the portal.
            </li>
          </ul>
          <div className="mt-4 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 text-xs border dark:border-amber-900/30">
            You are signed in as <strong>{user?.displayName}</strong> ·{" "}
            <strong>{user ? roleLabel(user.role) : "—"}</strong>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
