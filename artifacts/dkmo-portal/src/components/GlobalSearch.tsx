import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Users,
  CreditCard,
  CalendarDays,
  Handshake,
  HeartHandshake,
  Banknote,
  LifeBuoy,
  FileText,
  ClipboardList,
  Zap,
  Compass,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SearchResults {
  members: { id: string; fullName: string; membershipId: string; city: string; country: string }[];
  payments: { id: string; memberName: string; membershipId: string; paymentType: string; amountPaid: string; receiptNumber: string }[];
  events: { id: string; name: string; eventDate: string | null; location: string }[];
  sponsors: { id: string; sponsorName: string; company: string; tier: string }[];
  claims: { id: string; title: string; claimantName: string; beneficiaryName: string; claimType: string; caseStatus: string }[];
  loans: { id: string; loanType: string; principalAmount: string; status: string; memberName: string; membershipId: string }[];
  welfare: { id: string; requestNumber: string; serviceType: string; applicantName: string; status: string }[];
  documents: { id: string; title: string; fileName: string; category: string }[];
  applications: { id: string; dkmoNumber: string; fullName: string; status: string }[];
}

type FlatResult = { key: string; primary: string; secondary: string; href: string };
type Group = { label: string; icon: React.ReactNode; colorClass: string; items: FlatResult[] };

const SERVICE_LABEL: Record<string, string> = {
  medical_aid: "Medical Aid", education_aid: "Education Aid", marriage_aid: "Marriage Aid",
  funeral_aid: "Funeral Aid", housing_aid: "Housing Aid",
};

type Command = { label: string; keywords: string; href: string; kind: "action" | "page"; roles?: string[] };

const COMMANDS: Command[] = [
  { label: "Add Member", keywords: "new create member add", href: "/members", kind: "action", roles: ["admin", "finance"] },
  { label: "Record Payment", keywords: "new payment record add fee", href: "/payments", kind: "action", roles: ["admin", "finance"] },
  { label: "New FRF Claim", keywords: "new frf claim case create", href: "/frf", kind: "action", roles: ["admin", "finance"] },
  { label: "New Loan", keywords: "new loan create", href: "/loans", kind: "action", roles: ["admin", "finance"] },
  { label: "Upload Document", keywords: "upload document new file", href: "/documents", kind: "action", roles: ["admin", "finance"] },
  { label: "Add Sponsor", keywords: "new sponsor add", href: "/sponsors", kind: "action", roles: ["admin", "finance"] },
  { label: "Create Event", keywords: "new event create", href: "/events", kind: "action", roles: ["admin", "finance", "event"] },
  { label: "Generate Receipt", keywords: "receipt print generate", href: "/print-receipts", kind: "action", roles: ["admin", "finance"] },
  { label: "Dashboard", keywords: "dashboard home overview", href: "/dashboard", kind: "page" },
  { label: "Members", keywords: "members people list", href: "/members", kind: "page" },
  { label: "Payments", keywords: "payments fees finance", href: "/payments", kind: "page" },
  { label: "Family Relief Fund", keywords: "frf claims cases relief", href: "/frf", kind: "page" },
  { label: "Loans", keywords: "loans lending", href: "/loans", kind: "page" },
  { label: "Sponsors", keywords: "sponsors donors", href: "/sponsors", kind: "page" },
  { label: "Events", keywords: "events calendar", href: "/events", kind: "page" },
  { label: "Community Services", keywords: "services welfare medical education marriage funeral housing", href: "/services", kind: "page" },
  { label: "Committee", keywords: "committee executive core", href: "/committee", kind: "page" },
  { label: "Meetings", keywords: "meetings attendance", href: "/meetings", kind: "page" },
  { label: "Tasks", keywords: "tasks todo", href: "/tasks", kind: "page" },
  { label: "Documents", keywords: "documents files", href: "/documents", kind: "page" },
  { label: "Reports", keywords: "reports export", href: "/reports", kind: "page" },
  { label: "Receipts", keywords: "receipts print", href: "/receipts", kind: "page" },
  { label: "Membership Applications", keywords: "applications dkmo memberships recruitment", href: "/dkmo-memberships", kind: "page" },
  { label: "Audit Log", keywords: "audit trail history log", href: "/audit", kind: "page", roles: ["admin", "finance"] },
  { label: "Settings", keywords: "settings users configuration", href: "/settings", kind: "page", roles: ["admin"] },
];

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = query.trim().toLowerCase();

  const matchedCommands = useMemo(() => {
    const allowed = COMMANDS.filter((c) => !c.roles || c.roles.includes(role));
    if (!q) return allowed.filter((c) => c.kind === "action").slice(0, 6);
    return allowed
      .filter((c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q))
      .slice(0, 6);
  }, [q, role]);

  const groups: Group[] = useMemo(() => {
    const g: Group[] = [];
    if (matchedCommands.length > 0) {
      g.push({
        label: q ? "Actions & Pages" : "Quick Actions",
        icon: q ? <Compass className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />,
        colorClass: "text-amber-700 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/40",
        items: matchedCommands.map((c) => ({
          key: `cmd-${c.label}`,
          primary: c.label,
          secondary: c.kind === "action" ? "Action" : "Go to page",
          href: c.href,
        })),
      });
    }
    if (!results) return g;
    if (results.members.length) g.push({
      label: "Members", icon: <Users className="h-3.5 w-3.5" />,
      colorClass: "text-green-700 dark:text-green-400 bg-green-50/80 dark:bg-green-950/40",
      items: results.members.map((m) => ({ key: `m-${m.id}`, primary: m.fullName, secondary: `${m.membershipId}${m.city ? ` · ${m.city}` : ""}`, href: `/members/${m.id}` })),
    });
    if (results.claims?.length) g.push({
      label: "FRF Cases", icon: <HeartHandshake className="h-3.5 w-3.5" />,
      colorClass: "text-rose-700 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/40",
      items: results.claims.map((c) => ({ key: `c-${c.id}`, primary: c.title || c.claimantName, secondary: `${c.beneficiaryName || c.claimantName} · ${c.caseStatus.replace(/_/g, " ")}`, href: `/frf/${c.id}` })),
    });
    if (results.payments.length) g.push({
      label: "Payments", icon: <CreditCard className="h-3.5 w-3.5" />,
      colorClass: "text-blue-700 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40",
      items: results.payments.map((p) => ({ key: `p-${p.id}`, primary: `${p.memberName} — ${p.paymentType === "frf_contribution" ? "FRF Contribution" : "Membership Fee"}`, secondary: `SAR ${Number(p.amountPaid).toLocaleString()}${p.receiptNumber ? ` · Receipt ${p.receiptNumber}` : ""}`, href: `/payments` })),
    });
    if (results.loans?.length) g.push({
      label: "Loans", icon: <Banknote className="h-3.5 w-3.5" />,
      colorClass: "text-indigo-700 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40",
      items: results.loans.map((l) => ({ key: `l-${l.id}`, primary: `${l.memberName} — ${l.loanType}`, secondary: `SAR ${Number(l.principalAmount).toLocaleString()} · ${l.status}`, href: `/loans` })),
    });
    if (results.welfare?.length) g.push({
      label: "Community Services", icon: <LifeBuoy className="h-3.5 w-3.5" />,
      colorClass: "text-cyan-700 dark:text-cyan-400 bg-cyan-50/80 dark:bg-cyan-950/40",
      items: results.welfare.map((w) => ({ key: `w-${w.id}`, primary: `${w.applicantName} — ${SERVICE_LABEL[w.serviceType] ?? w.serviceType}`, secondary: `${w.requestNumber} · ${w.status}`, href: `/services/${w.serviceType}` })),
    });
    if (results.applications?.length) g.push({
      label: "Membership Applications", icon: <ClipboardList className="h-3.5 w-3.5" />,
      colorClass: "text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40",
      items: results.applications.map((a) => ({ key: `a-${a.id}`, primary: a.fullName, secondary: `${a.dkmoNumber} · ${a.status}`, href: `/dkmo-memberships` })),
    });
    if (results.documents?.length) g.push({
      label: "Documents", icon: <FileText className="h-3.5 w-3.5" />,
      colorClass: "text-slate-700 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/60",
      items: results.documents.map((d) => ({ key: `d-${d.id}`, primary: d.title, secondary: d.fileName || d.category, href: `/documents` })),
    });
    if (results.events.length) g.push({
      label: "Events", icon: <CalendarDays className="h-3.5 w-3.5" />,
      colorClass: "text-purple-700 dark:text-purple-400 bg-purple-50/80 dark:bg-purple-950/40",
      items: results.events.map((e) => ({ key: `e-${e.id}`, primary: e.name, secondary: `${e.location}${e.eventDate ? ` · ${new Date(e.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}`, href: `/events/${e.id}` })),
    });
    if (results.sponsors.length) g.push({
      label: "Sponsors", icon: <Handshake className="h-3.5 w-3.5" />,
      colorClass: "text-teal-700 dark:text-teal-400 bg-teal-50/80 dark:bg-teal-950/40",
      items: results.sponsors.map((s) => ({ key: `s-${s.id}`, primary: s.sponsorName, secondary: `${s.company}${s.tier ? ` · ${s.tier}` : ""}`, href: `/sponsors/${s.id}` })),
    });
    return g;
  }, [results, matchedCommands, q]);

  const flatResults: FlatResult[] = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Cmd+K / Ctrl+K opens the palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedIndex(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${basePath}/api/search?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          const data: SearchResults = await res.json();
          setResults(data);
          setSelectedIndex(-1);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function navigate(href: string) {
    setLocation(href);
    setOpen(false);
    setQuery("");
    setResults(null);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      setOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[selectedIndex >= 0 ? selectedIndex : 0];
      if (item) navigate(item.href);
    }
  }

  const hasSearchHits = results !== null && Object.values(results).some((arr) => Array.isArray(arr) && arr.length > 0);
  const showDropdown = open && (q.length >= 2 || matchedCommands.length > 0);
  let runningIndex = -1;

  return (
    <div ref={containerRef} className="relative hidden sm:flex flex-1 max-w-lg">
      <div className="relative flex items-center w-full">
        <Search className="absolute left-3 h-4 w-4 text-green-600/50 dark:text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search anything…"
          aria-label="Global search"
          className="w-full h-9 pl-9 pr-16 text-sm rounded-xl border border-green-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 text-green-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 dark:focus:border-green-600 transition-all"
        />
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600/60" />}
          {query && !loading && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
              className="rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!query && (
            <kbd className="hidden lg:inline-flex h-5 select-none items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-500">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-green-100 dark:border-slate-800 rounded-2xl shadow-2xl shadow-green-900/10 dark:shadow-black/40 overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading && !results && q.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching…
            </div>
          )}

          {!loading && q.length >= 2 && results && !hasSearchHits && matchedCommands.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              No results for <span className="font-medium text-slate-600 dark:text-slate-300">"{query}"</span>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.label}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${g.colorClass}`}>
                {g.icon}
                {g.label}
              </div>
              {g.items.map((item) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <ResultRow
                    key={item.key}
                    primary={item.primary}
                    secondary={item.secondary}
                    selected={selectedIndex === idx}
                    onClick={() => navigate(item.href)}
                  />
                );
              })}
            </div>
          ))}

          {flatResults.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> select</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  primary,
  secondary,
  selected,
  onClick,
}: {
  primary: string;
  secondary: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors group ${
        selected ? "bg-green-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-medium truncate ${selected ? "text-green-900 dark:text-green-300" : "text-slate-800 dark:text-slate-200"}`}>
          {primary}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{secondary}</p>
      </div>
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${
        selected ? "text-green-600 translate-x-0.5" : "text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-green-500"
      }`} />
    </button>
  );
}
