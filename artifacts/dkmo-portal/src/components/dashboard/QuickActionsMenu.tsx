import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Zap,
  UserPlus,
  CreditCard,
  HeartHandshake,
  ChevronDown,
  ListChecks,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { withReturnTo } from "@/lib/navigation";

type Action = { label: string; icon: typeof UserPlus; to: string; roles: string[]; testId: string };

const ACTIONS: Action[] = [
  { label: "Add Member", icon: UserPlus, to: "/members", roles: ["admin", "finance"], testId: "qa-add-member" },
  { label: "Record Payment", icon: CreditCard, to: "/payments", roles: ["admin", "finance"], testId: "qa-record-payment" },
  { label: "Review FRF Claims", icon: HeartHandshake, to: "/frf", roles: ["admin", "finance"], testId: "qa-review-frf" },
  { label: "Create Task", icon: ListChecks, to: "/tasks/new", roles: ["admin", "event", "finance"], testId: "qa-create-task" },
  { label: "View Pending Membership", icon: CreditCard, to: "/payments?view=unpaid", roles: ["admin", "finance"], testId: "qa-pending-membership" },
  { label: "View Pending FRF Fees", icon: HeartHandshake, to: "/payments?tab=frf&frfStatus=pending", roles: ["admin", "finance"], testId: "qa-pending-frf" },
];

/** Top-right dashboard quick actions dropdown. */
export function QuickActionsMenu() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const actions = ACTIONS.filter((a) => a.roles.includes(role));
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="button-quick-actions-menu"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-green-600 to-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm ring-1 ring-green-500/40 transition-shadow hover:shadow-md"
        >
          <Zap className="h-4 w-4" />
          Quick Actions
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <DropdownMenuItem key={a.label} data-testid={a.testId} onSelect={() => setLocation(withReturnTo(a.to))} className="gap-2.5 cursor-pointer">
              <Icon className="h-4 w-4 text-green-600" />
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
