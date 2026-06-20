import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, UserPlus, CalendarPlus, Users, X } from "lucide-react";

type Action = { label: string; icon: typeof UserPlus; to: string; testId: string };

const ACTIONS: Action[] = [
  { label: "Add Member", icon: UserPlus, to: "/members", testId: "fab-add-member" },
  { label: "Create Event", icon: CalendarPlus, to: "/events", testId: "fab-create-event" },
  { label: "Add Committee Member", icon: Users, to: "/committee", testId: "fab-add-committee" },
];

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.ul
            className="flex flex-col items-end gap-2.5"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
              hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
            }}
          >
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <motion.li
                  key={a.to}
                  variants={{
                    hidden: { opacity: 0, y: 12, scale: 0.85 },
                    visible: { opacity: 1, y: 0, scale: 1 },
                  }}
                >
                  <button
                    type="button"
                    onClick={() => go(a.to)}
                    data-testid={a.testId}
                    className="group flex items-center gap-2.5 rounded-full bg-white dark:bg-slate-800 pl-4 pr-3 py-2.5 shadow-lg ring-1 ring-green-100 dark:ring-slate-700 transition-all hover:-translate-x-0.5 hover:shadow-xl"
                  >
                    <span className="text-sm font-medium text-green-950 dark:text-slate-100 whitespace-nowrap">
                      {a.label}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 dark:bg-slate-700 text-green-700 dark:text-green-400 group-hover:bg-green-100 dark:group-hover:bg-slate-600">
                      <Icon className="h-4 w-4" />
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        data-testid="button-quick-actions"
        whileTap={{ scale: 0.92 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-700 text-white shadow-xl ring-1 ring-green-500/40 transition-shadow hover:shadow-2xl"
      >
        <motion.span animate={{ rotate: open ? 135 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </motion.span>
      </motion.button>
    </div>
  );
}
