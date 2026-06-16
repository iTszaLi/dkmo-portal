import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  AlertCircle,
  FileText,
  LogOut,
  Menu,
  ShieldCheck,
  Handshake,
  CalendarDays,
  ListChecks,
  Cog,
  HeartHandshake,
  HandHelping,
  Crown,
  BookUser,
  Landmark,
  Receipt,
  FolderOpen,
  Printer,
  ScrollText,
  Trophy,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DkmoLogo } from "@/components/DkmoLogo";
import { useAuth, roleLabel, type Role } from "@/lib/auth";

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const navigation: NavItem[] = [
  { name: "Dashboard",         href: "/dashboard",         icon: LayoutDashboard },
  { name: "Members",           href: "/members",           icon: Users },
  { name: "Committee",         href: "/committee",         icon: Crown },
  { name: "Payments",          href: "/payments",          icon: CreditCard },
  { name: "Community Services", href: "/services",          icon: HandHelping },
  { name: "FRF Claims",        href: "/frf",               icon: HeartHandshake },
  { name: "DKMO Membership",  href: "/dkmo-memberships",  icon: BookUser },
  { name: "Sponsors",          href: "/sponsors",          icon: Handshake },
  { name: "Events",            href: "/events",            icon: CalendarDays },
  { name: "Tasks",             href: "/tasks",             icon: ListChecks },
  { name: "Pending",           href: "/pending",           icon: AlertCircle },
  { name: "Loans",             href: "/loans",             icon: Landmark },
  { name: "Receipts",          href: "/receipts",          icon: Receipt },
  { name: "Print Receipts",    href: "/print-receipts",    icon: Printer },
  { name: "Documents",         href: "/documents",         icon: FolderOpen },
  { name: "Reports",           href: "/reports",           icon: FileText },
  { name: "Audit Trail",       href: "/audit",             icon: ScrollText, roles: ["admin", "finance"] },
  { name: "Settings",          href: "/settings",          icon: Cog, roles: ["admin"] },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-300",
  finance: "bg-blue-100 text-blue-900 ring-1 ring-blue-300",
  event: "bg-purple-100 text-purple-900 ring-1 ring-purple-300",
  viewer: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
};

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    setLocation("/login");
  };

  const role: Role = (user?.role ?? "viewer") as Role;
  const visibleNav = navigation.filter(
    (item) => !item.roles || item.roles.includes(role),
  );

  const SidebarLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1.5">
      {visibleNav.map((item) => {
        const isActive =
          location === item.href ||
          (item.href !== "/dashboard" && location.startsWith(item.href + "/"));
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            data-testid={`nav-${item.name.toLowerCase()}`}
            className={cn(
              "nav-tab group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium",
              "transition-all duration-200 ease-in-out",
              "hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-md hover:shadow-green-900/5 dark:hover:shadow-black/20",
              "active:scale-[0.98] active:translate-y-0 active:shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/40 dark:focus-visible:ring-green-500/40",
              isActive
                ? "bg-gradient-to-r from-green-700 to-green-800 dark:from-green-700 dark:to-green-800 text-white shadow-md shadow-green-900/20"
                : "text-green-900/70 dark:text-slate-400 hover:bg-green-50 dark:hover:bg-slate-800 hover:text-green-900 dark:hover:text-green-300",
            )}
          >
            <item.icon
              className={cn(
                "h-4.5 w-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                isActive ? "text-white" : "text-green-700/70 dark:text-slate-500 group-hover:text-green-800 dark:group-hover:text-green-400",
              )}
            />
            <span className="flex-1">{item.name}</span>
            <span
              className={cn(
                "pointer-events-none absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-orange-400 origin-left transition-transform duration-300 ease-out",
                isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
              )}
              aria-hidden
            />
          </Link>
        );
      })}
    </nav>
  );

  const displayName = user?.displayName ?? "User";

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-green-50/40 via-white to-orange-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-green-100/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/90 backdrop-blur">
        <div className="flex h-16 items-center gap-2 border-b border-green-100/70 dark:border-slate-800 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <DkmoLogo className="h-9 w-9" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-green-900 dark:text-green-300">DKMO Portal</span>
              <span className="text-[10px] uppercase tracking-wider text-green-700/60 dark:text-green-500/60">
                Executive Suite
              </span>
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-5 px-3">
          <SidebarLinks />
        </div>
        <div className="border-t border-green-100/70 dark:border-slate-800 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-green-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs text-green-800 dark:text-green-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Secure session · auto-logout after 30 min</span>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 sm:gap-4 sm:py-4">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-green-100/60 dark:border-slate-800 bg-white/85 dark:bg-slate-900/90 backdrop-blur px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          {/* Mobile sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="md:hidden border-green-200"
                data-testid="button-mobile-menu"
              >
                <Menu className="h-5 w-5 text-green-800" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs p-0 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex h-16 items-center gap-2 border-b border-green-100 dark:border-slate-800 px-5">
                <DkmoLogo className="h-9 w-9" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-bold text-green-900 dark:text-green-300">DKMO Portal</span>
                  <span className="text-[10px] uppercase tracking-wider text-green-700/60 dark:text-green-500/60">
                    Executive Suite
                  </span>
                </div>
              </div>
              <div className="px-3 py-5">
                <SidebarLinks />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <ThemeToggle />
          {user && <NotificationBell />}

          {user && (
            <Badge
              data-testid="badge-role"
              className={cn(
                "hidden sm:inline-flex h-7 px-3 text-[11px] font-semibold uppercase tracking-wider",
                ROLE_BADGE[role],
              )}
            >
              <ShieldCheck className="h-3 w-3 mr-1" />
              {roleLabel(role)}
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="rounded-full pl-1.5 pr-3 h-10 gap-2 hover:bg-green-50 dark:hover:bg-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8 ring-2 ring-green-100 dark:ring-slate-700">
                  <AvatarFallback className="bg-gradient-to-br from-green-700 to-green-800 text-white text-xs font-semibold">
                    {initialsOf(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold text-green-900 dark:text-green-300">{displayName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-green-700/60 dark:text-green-600/70">
                    {roleLabel(role)}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold leading-none text-green-900 dark:text-green-300">
                    {displayName}
                  </p>
                  <p className="text-xs leading-none text-green-700/70 dark:text-slate-400">
                    @{user?.username ?? "—"}
                  </p>
                  <Badge
                    className={cn(
                      "mt-1 w-fit text-[10px] uppercase tracking-wider",
                      ROLE_BADGE[role],
                    )}
                  >
                    {roleLabel(role)}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                data-testid="button-signout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 sm:px-6 sm:py-0">{children}</main>
      </div>
    </div>
  );
}
