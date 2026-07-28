import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, CalendarDays, Users2, ListChecks, Handshake,
  FolderOpen, Cake, Circle, Plus,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useCreateEvent, useCreateMeeting } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type CalendarItem = {
  date: string; // YYYY-MM-DD
  type: "event" | "meeting" | "task" | "sponsor_due" | "document_expiry" | "birthday";
  title: string;
  href: string;
  meta?: string;
};

const TYPE_STYLE: Record<CalendarItem["type"], { label: string; dot: string; chip: string; icon: typeof Circle }> = {
  event:           { label: "Event",        dot: "bg-green-500",  chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",   icon: CalendarDays },
  meeting:         { label: "Meeting",      dot: "bg-blue-500",   chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",       icon: Users2 },
  task:            { label: "Task due",     dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", icon: ListChecks },
  sponsor_due:     { label: "Sponsor",      dot: "bg-purple-500", chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", icon: Handshake },
  document_expiry: { label: "Doc expiry",   dot: "bg-red-500",    chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",           icon: FolderOpen },
  birthday:        { label: "Birthday",     dot: "bg-pink-500",   chip: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",       icon: Cake },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canScheduleEvent = hasRole("admin", "event");
  const queryClient = useQueryClient();

  // ── schedule dialog ─────────────────────────────────────────────────────────
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<"event" | "meeting">("event");
  const [scheduleForm, setScheduleForm] = useState({ title: "", date: "", location: "", notes: "" });
  const createEvent = useCreateEvent();
  const createMeeting = useCreateMeeting();
  const scheduling = createEvent.isPending || createMeeting.isPending;

  const openSchedule = (presetDate?: string) => {
    setScheduleType(canScheduleEvent ? "event" : "meeting");
    setScheduleForm({
      title: "",
      date: presetDate ?? new Date().toISOString().split("T")[0]!,
      location: "",
      notes: "",
    });
    setScheduleOpen(true);
  };

  const afterScheduled = (label: string) => {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    setScheduleOpen(false);
    setSelectedDate(scheduleForm.date);
    toast({ title: `${label} scheduled`, description: new Date(scheduleForm.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) });
  };

  const submitSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.title.trim() || !scheduleForm.date) {
      toast({ title: "Missing details", description: "A title and date are required.", variant: "destructive" });
      return;
    }
    if (scheduleType === "event") {
      createEvent.mutate(
        {
          data: {
            name: scheduleForm.title.trim(),
            eventDate: new Date(scheduleForm.date + "T00:00:00").toISOString(),
            location: scheduleForm.location.trim(),
            description: scheduleForm.notes.trim(),
            status: "upcoming",
          },
        },
        {
          onSuccess: () => afterScheduled("Event"),
          onError: () => toast({ title: "Could not schedule the event", variant: "destructive" }),
        },
      );
    } else {
      createMeeting.mutate(
        {
          data: {
            title: scheduleForm.title.trim(),
            meetingDate: scheduleForm.date,
            location: scheduleForm.location.trim() || undefined,
            notes: scheduleForm.notes.trim() || undefined,
          },
        },
        {
          onSuccess: () => afterScheduled("Meeting"),
          onError: () => toast({ title: "Could not schedule the meeting", variant: "destructive" }),
        },
      );
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", year, month],
    queryFn: async (): Promise<{ items: CalendarItem[] }> => {
      const res = await fetch(`${basePath}/api/calendar?year=${year}&month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of data?.items ?? []) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return map;
  }, [data]);

  const navigate = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y); setSelectedDate(null);
  };

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const dateKey = (day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const selectedItems = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-emerald-950 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> Calendar
            </h1>
            <p className="text-sm text-emerald-700/80 dark:text-slate-400">
              Events, meetings, task deadlines, sponsor follow-ups, document expiries and birthdays.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Previous month" data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[160px] text-center font-semibold text-emerald-950 dark:text-slate-100">
              {MONTHS[month - 1]} {year}
            </span>
            <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Next month" data-testid="button-next-month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSelectedDate(todayKey); }}
              data-testid="button-today"
            >
              Today
            </Button>
            <Button
              onClick={() => openSchedule(selectedDate ?? undefined)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              data-testid="button-schedule"
            >
              <Plus className="h-4 w-4" /> Schedule
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(TYPE_STYLE).map(([k, v]) => (
            <span key={k} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", v.chip)}>
              <span className={cn("h-2 w-2 rounded-full", v.dot)} /> {v.label}
            </span>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              {isLoading ? (
                <Skeleton className="h-[480px] w-full" />
              ) : (
                <>
                  <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-emerald-700/70 dark:text-slate-500 mb-1">
                    {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={`e-${i}`} />;
                      const key = dateKey(day);
                      const items = byDate.get(key) ?? [];
                      const isToday = key === todayKey;
                      const isSelected = key === selectedDate;
                      const hasItems = items.length > 0;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedDate(key)}
                          data-testid={`cal-day-${day}`}
                          className={cn(
                            "min-h-[72px] sm:min-h-[86px] rounded-lg border p-1.5 text-left align-top transition-colors",
                            "border-emerald-100/70 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-800/60",
                            hasItems && "bg-emerald-50 border-emerald-300 dark:bg-emerald-900/25 dark:border-emerald-700",
                            isSelected && "ring-2 ring-emerald-500 dark:ring-emerald-400",
                            isToday && "bg-emerald-100/80 dark:bg-emerald-900/40",
                          )}
                        >
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday ? "bg-emerald-600 text-white" : "text-emerald-900 dark:text-slate-200",
                          )}>
                            {day}
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {items.slice(0, 3).map((it, j) => (
                              <div key={j} className="flex items-center gap-1 truncate text-[10px] text-emerald-900/80 dark:text-slate-300">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TYPE_STYLE[it.type].dot)} />
                                <span className="truncate">{it.title}</span>
                              </div>
                            ))}
                            {items.length > 3 ? (
                              <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">+{items.length - 3} more</p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Day / month agenda */}
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm h-fit">
            <CardContent className="p-4">
              <h2 className="text-sm font-bold text-emerald-950 dark:text-slate-100 mb-3">
                {selectedDate
                  ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
                  : `All in ${MONTHS[month - 1]}`}
              </h2>
              {(selectedDate ? selectedItems : data?.items ?? []).length === 0 ? (
                <p className="text-sm text-emerald-700/70 dark:text-slate-400 py-4 text-center">Nothing scheduled.</p>
              ) : (
                <ul className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {(selectedDate ? selectedItems : data?.items ?? []).map((it, i) => {
                    const style = TYPE_STYLE[it.type];
                    const Icon = style.icon;
                    return (
                      <li key={i}>
                        <Link href={it.href} className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-emerald-50 dark:hover:bg-slate-800/60 transition-colors">
                          <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", style.chip)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-emerald-950 dark:text-slate-100">{it.title}</span>
                            <span className="block text-[11px] text-emerald-700/70 dark:text-slate-400">
                              {style.label}{!selectedDate ? ` · ${new Date(it.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Schedule dialog */}
        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Schedule something</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => canScheduleEvent && setScheduleType("event")}
                  disabled={!canScheduleEvent}
                  title={canScheduleEvent ? undefined : "Only admins and event coordinators can schedule events"}
                  aria-pressed={scheduleType === "event"}
                  data-testid="button-schedule-type-event"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    scheduleType === "event"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                    !canScheduleEvent && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <CalendarDays className="h-4 w-4" /> Event
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType("meeting")}
                  aria-pressed={scheduleType === "meeting"}
                  data-testid="button-schedule-type-meeting"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    scheduleType === "meeting"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  <Users2 className="h-4 w-4" /> Meeting
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{scheduleType === "event" ? "Event name" : "Meeting title"}</label>
                <Input
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={scheduleType === "event" ? "e.g. Annual Family Gathering" : "e.g. Core Committee Meeting"}
                  autoFocus
                  data-testid="input-schedule-title"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, date: e.target.value }))}
                  data-testid="input-schedule-date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Location (optional)</label>
                <Input
                  value={scheduleForm.location}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, location: e.target.value }))}
                  data-testid="input-schedule-location"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Input
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))}
                  data-testid="input-schedule-notes"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={scheduling} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-schedule-save">
                  Schedule
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
  );
}
