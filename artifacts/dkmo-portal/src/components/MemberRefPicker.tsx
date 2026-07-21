import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Search, Check } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface MemberRefEntry {
  id: string;
  fullName: string;
  membershipId: string;
}

interface MemberRefPickerProps {
  value: MemberRefEntry | null;
  onChange: (m: MemberRefEntry | null) => void;
}

export function MemberRefPicker({ value, onChange }: MemberRefPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberRefEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${basePath}/api/dkmo/members-list`)
      .then((r) => r.json())
      .then((data: MemberRefEntry[]) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = members
    .filter(
      (m) =>
        m.fullName.toLowerCase().includes(query.toLowerCase()) ||
        m.membershipId.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-md border px-3 h-10 text-sm text-left transition-colors ${
          value
            ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-900/20"
            : "border-input bg-background"
        } dark:text-slate-100`}
      >
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>
          {value ? `${value.fullName} (${value.membershipId})` : "Search and select a member…"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-emerald-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded border border-emerald-200 dark:border-slate-700 bg-transparent dark:text-slate-100 outline-none focus:border-emerald-500"
                placeholder="Type name or member ID…"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading && <p className="text-center text-xs text-slate-400 py-4">Loading members…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">No members found</p>
            )}
            {!loading && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    onChange(null);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  — None / Clear selection
                </button>
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors ${
                      value?.id === m.id ? "bg-emerald-50 dark:bg-emerald-900/30 font-semibold" : ""
                    }`}
                  >
                    {value?.id === m.id && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    <span className="text-emerald-900 dark:text-slate-100">{m.fullName}</span>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{m.membershipId}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
