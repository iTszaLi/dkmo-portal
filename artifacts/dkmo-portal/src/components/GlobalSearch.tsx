import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Users,
  CreditCard,
  BookUser,
  CalendarDays,
  Handshake,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SearchResultMember {
  id: string;
  fullName: string;
  membershipId: string;
  city: string;
  country: string;
}
interface SearchResultPayment {
  id: string;
  memberName: string;
  membershipId: string;
  month: string;
  amountPaid: string;
  receiptNumber: string;
  paymentMethod: string;
}
interface SearchResultFrf {
  id: string;
  fullName: string;
  frfNumber: string;
  status: string;
}
interface SearchResultEvent {
  id: string;
  name: string;
  eventDate: string | null;
  location: string;
  status: string;
}
interface SearchResultSponsor {
  id: string;
  sponsorName: string;
  company: string;
  tier: string;
}

interface SearchResults {
  members: SearchResultMember[];
  payments: SearchResultPayment[];
  frfMemberships: SearchResultFrf[];
  events: SearchResultEvent[];
  sponsors: SearchResultSponsor[];
}

type FlatResult = {
  key: string;
  primary: string;
  secondary: string;
  href: string;
};

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatResults: FlatResult[] = results
    ? [
        ...results.members.map((m) => ({
          key: `m-${m.id}`,
          primary: m.fullName,
          secondary: `${m.membershipId} · ${m.city}`,
          href: `/members/${m.id}`,
        })),
        ...results.payments.map((p) => ({
          key: `p-${p.id}`,
          primary: `${p.memberName} — ${p.month}`,
          secondary: `AED ${Number(p.amountPaid).toLocaleString()} · Receipt ${p.receiptNumber}`,
          href: `/payments`,
        })),
        ...results.frfMemberships.map((f) => ({
          key: `f-${f.id}`,
          primary: f.fullName,
          secondary: `${f.frfNumber} · ${f.status.replace(/_/g, " ")}`,
          href: `/frf-membership/${f.id}`,
        })),
        ...results.events.map((e) => ({
          key: `e-${e.id}`,
          primary: e.name,
          secondary: `${e.location}${
            e.eventDate
              ? ` · ${new Date(e.eventDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`
              : ""
          }`,
          href: `/events/${e.id}`,
        })),
        ...results.sponsors.map((s) => ({
          key: `s-${s.id}`,
          primary: s.sponsorName,
          secondary: s.company || s.tier,
          href: `/sponsors`,
        })),
      ]
    : [];

  // Cmd+K / Ctrl+K to focus
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${basePath}/api/search?q=${encodeURIComponent(q)}`,
        );
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
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const item = flatResults[selectedIndex];
      if (item) navigate(item.href);
    }
  }

  const hasResults =
    results &&
    (results.members.length > 0 ||
      results.payments.length > 0 ||
      results.frfMemberships.length > 0 ||
      results.events.length > 0 ||
      results.sponsors.length > 0);

  // Per-group index offsets for keyboard selection
  const mOffset = 0;
  const pOffset = mOffset + (results?.members.length ?? 0);
  const fOffset = pOffset + (results?.payments.length ?? 0);
  const eOffset = fOffset + (results?.frfMemberships.length ?? 0);
  const sOffset = eOffset + (results?.events.length ?? 0);

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative hidden sm:flex flex-1 max-w-lg">
      {/* Input */}
      <div className="relative flex items-center w-full">
        <Search className="absolute left-3 h-4 w-4 text-green-600/50 dark:text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search members, payments, FRF…"
          aria-label="Global search"
          className="w-full h-9 pl-9 pr-16 text-sm rounded-xl border border-green-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 text-green-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 dark:focus:border-green-600 transition-all"
        />
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600/60" />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults(null);
                setOpen(false);
                inputRef.current?.focus();
              }}
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

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-green-100 dark:border-slate-800 rounded-2xl shadow-2xl shadow-green-900/10 dark:shadow-black/40 overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading && !results && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Searching…
            </div>
          )}

          {!loading && results && !hasResults && (
            <div className="py-8 text-center text-sm text-slate-400">
              No results for{" "}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                "{query}"
              </span>
            </div>
          )}

          {/* Members */}
          {results && results.members.length > 0 && (
            <ResultGroup
              label="Members"
              icon={<Users className="h-3.5 w-3.5" />}
              colorClass="text-green-700 dark:text-green-400 bg-green-50/80 dark:bg-green-950/40"
            >
              {results.members.map((m, i) => (
                <ResultRow
                  key={m.id}
                  primary={m.fullName}
                  secondary={`${m.membershipId} · ${m.city}, ${m.country}`}
                  selected={selectedIndex === mOffset + i}
                  onClick={() => navigate(`/members/${m.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {/* Payments */}
          {results && results.payments.length > 0 && (
            <ResultGroup
              label="Payments"
              icon={<CreditCard className="h-3.5 w-3.5" />}
              colorClass="text-blue-700 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40"
            >
              {results.payments.map((p, i) => (
                <ResultRow
                  key={p.id}
                  primary={`${p.memberName} — ${p.month}`}
                  secondary={`AED ${Number(p.amountPaid).toLocaleString()} · Receipt ${p.receiptNumber}`}
                  selected={selectedIndex === pOffset + i}
                  onClick={() => navigate(`/payments`)}
                />
              ))}
            </ResultGroup>
          )}

          {/* FRF Applications */}
          {results && results.frfMemberships.length > 0 && (
            <ResultGroup
              label="FRF Applications"
              icon={<BookUser className="h-3.5 w-3.5" />}
              colorClass="text-orange-700 dark:text-orange-400 bg-orange-50/80 dark:bg-orange-950/40"
            >
              {results.frfMemberships.map((f, i) => (
                <ResultRow
                  key={f.id}
                  primary={f.fullName}
                  secondary={`${f.frfNumber} · ${f.status.replace(/_/g, " ")}`}
                  selected={selectedIndex === fOffset + i}
                  onClick={() => navigate(`/frf-membership/${f.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {/* Events */}
          {results && results.events.length > 0 && (
            <ResultGroup
              label="Events"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              colorClass="text-purple-700 dark:text-purple-400 bg-purple-50/80 dark:bg-purple-950/40"
            >
              {results.events.map((e, i) => (
                <ResultRow
                  key={e.id}
                  primary={e.name}
                  secondary={`${e.location}${
                    e.eventDate
                      ? ` · ${new Date(e.eventDate).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}`
                      : ""
                  }`}
                  selected={selectedIndex === eOffset + i}
                  onClick={() => navigate(`/events/${e.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {/* Sponsors */}
          {results && results.sponsors.length > 0 && (
            <ResultGroup
              label="Sponsors"
              icon={<Handshake className="h-3.5 w-3.5" />}
              colorClass="text-teal-700 dark:text-teal-400 bg-teal-50/80 dark:bg-teal-950/40"
            >
              {results.sponsors.map((s, i) => (
                <ResultRow
                  key={s.id}
                  primary={s.sponsorName}
                  secondary={`${s.company}${s.tier ? ` · ${s.tier}` : ""}`}
                  selected={selectedIndex === sOffset + i}
                  onClick={() => navigate(`/sponsors`)}
                />
              ))}
            </ResultGroup>
          )}

          {/* Footer hint */}
          {hasResults && (
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

function ResultGroup({
  label,
  icon,
  colorClass,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${colorClass}`}
      >
        {icon}
        {label}
      </div>
      {children}
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
        selected
          ? "bg-green-50 dark:bg-slate-800"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
      }`}
    >
      <div className="min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            selected
              ? "text-green-900 dark:text-green-300"
              : "text-slate-800 dark:text-slate-200"
          }`}
        >
          {primary}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {secondary}
        </p>
      </div>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 transition-transform ${
          selected
            ? "text-green-600 translate-x-0.5"
            : "text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-green-500"
        }`}
      />
    </button>
  );
}
