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
  Banknote,
  FileUp,
  Handshake,
  CalendarPlus,
  ReceiptText,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

type Action = { label: string; icon: typeof UserPlus; to: string; roles: string[]; testId: string };

const ACTIONS: Action[] = [
  { label: "Add Member", icon: UserPlus, to: "/members", roles: ["admin", "finance"], testId: "qa-add-member" },
  { label: "Record Payment", icon: CreditCard, to: "/payments", roles: ["admin", "finance"], testId: "qa-record-payment" },
  { label: "New FRF Claim", icon: HeartHandshake, to: "/frf", roles: ["admin", "finance"], testId: "qa-new-frf" },
  { label: "New Loan", icon: Banknote, to: "/loans", roles: ["admin", "finance"], testId: "qa-new-loan" },
  { label: "Upload Document", icon: FileUp, to: "/documents", roles: ["admin", "finance"], testId: "qa-upload-doc" },
  { label: "Add Sponsor", icon: Handshake, to: "/sponsors", roles: ["admin", "finance"], testId: "qa-add-sponsor" },
  { label: "Create Event", icon: CalendarPlus, to: "/events", roles: ["admin", "finance", "event"], testId: "qa-create-event" },
  { label: "Generate Receipt", icon: ReceiptText, to: "/receipts?tab=generate", roles: ["admin", "finance"], testId: "qa-receipt" },
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
            <DropdownMenuItem key={a.label} data-testid={a.testId} onSelect={() => setLocation(a.to)} className="gap-2.5 cursor-pointer">
              <Icon className="h-4 w-4 text-green-600" />
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
