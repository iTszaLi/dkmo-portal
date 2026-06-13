import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  useGetEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getGetEventQueryKey,
  useListTasks,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Trash2, ListChecks, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const EVENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
type EventStatus = (typeof EVENT_STATUSES)[number];

const STATUS_STYLE: Record<EventStatus, string> = {
  upcoming:  "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  ongoing:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  completed: "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
  cancelled: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
};

const PRIORITY_STYLE = {
  urgent: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
  high:   "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  medium: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  low:    "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
};

const TASK_STATUS_STYLE = {
  pending:     "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  in_progress: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  completed:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  cancelled:   "bg-slate-100 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-500",
};

interface FormState {
  name: string;
  eventDate: string;
  location: string;
  budget: string;
  description: string;
  status: EventStatus;
}

const EMPTY: FormState = {
  name: "",
  eventDate: "",
  location: "",
  budget: "0",
  description: "",
  status: "upcoming",
};

export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const id = params?.id;
  const isNew = id === "new";

  const { data: event, isLoading, refetch } = useGetEvent(id ?? "", {
    query: { enabled: !!id && !isNew, queryKey: getGetEventQueryKey(id ?? "") },
  });

  const { data: tasksData } = useListTasks(
    { eventId: id ?? "", pageSize: 50 },
    { query: { enabled: !!id && !isNew } },
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(isNew);

  useEffect(() => {
    if (!isNew && event) {
      setForm({
        name: event.name,
        eventDate: event.eventDate ? event.eventDate.slice(0, 10) : "",
        location: event.location,
        budget: String(event.budget ?? 0),
        description: event.description,
        status: event.status as EventStatus,
      });
    }
  }, [event, isNew]);

  const createMutation = useCreateEvent({
    mutation: {
      onSuccess: (created) => {
        toast({ title: "Event created" });
        setLocation(`/events/${created.id}`);
      },
      onError: (err) =>
        toast({ title: "Could not create", description: String(err), variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Saved" });
        setEditing(false);
        refetch();
      },
      onError: (err) =>
        toast({ title: "Could not save", description: String(err), variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Event deleted" });
        setLocation("/events");
      },
      onError: (err) =>
        toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
    },
  });

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Event name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      eventDate: form.eventDate ? new Date(form.eventDate + "T00:00:00.000Z").toISOString() : null,
      location: form.location.trim(),
      budget: Number(form.budget) || 0,
      description: form.description,
      status: form.status,
    };
    if (isNew) {
      createMutation.mutate({ data: payload });
    } else if (id) {
      updateMutation.mutate({ id, data: payload });
    }
  };

  const onDelete = () => {
    if (!event || !id) return;
    if (!confirm(`Delete event "${event.name}"?`)) return;
    deleteMutation.mutate({ id });
  };

  if (!isNew && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && !event && !isLoading) {
    return (
      <div className="text-center py-12 text-green-700/70 dark:text-slate-500">
        Event not found.{" "}
        <Link href="/events" className="text-green-800 dark:text-green-400 underline">Back</Link>
      </div>
    );
  }

  const tasks = tasksData?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/events">
            <Button variant="ghost" size="sm" className="text-green-800 dark:text-green-400 hover:bg-green-50 dark:hover:bg-slate-800">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">
              {isNew ? "New Event" : event!.name}
            </h1>
            {!isNew && event && (
              <Badge className={cn("mt-1 capitalize", STATUS_STYLE[event.status as EventStatus])}>
                {event.status}
              </Badge>
            )}
          </div>
        </div>
        {!isNew && canEdit && !editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}
              className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30">
              Edit
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-green-950 dark:text-green-100">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="name" className="dark:text-slate-300">Event Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                disabled={!editing}
                placeholder="Annual Fundraising Gala"
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="eventDate" className="dark:text-slate-300">Event Date</Label>
              <Input
                id="eventDate"
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate", e.target.value)}
                disabled={!editing}
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="status" className="dark:text-slate-300">Status</Label>
              {editing ? (
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1">
                  <Badge className={cn("capitalize", STATUS_STYLE[form.status])}>{form.status}</Badge>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="location" className="dark:text-slate-300">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                disabled={!editing}
                placeholder="Community Hall, Mangalore"
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="budget" className="dark:text-slate-300">Budget (SAR)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                value={form.budget}
                onChange={(e) => set("budget", e.target.value)}
                disabled={!editing}
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="description" className="dark:text-slate-300">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={!editing}
                rows={3}
                placeholder="Event notes or agenda…"
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
          </CardContent>
        </Card>

        {editing && (
          <div className="flex gap-3">
            <Button
              type="submit"
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {isNew ? "Create Event" : "Save Changes"}
            </Button>
            {!isNew && (
              <Button type="button" variant="outline"
                className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </form>

      {!isNew && (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Tasks ({tasks.length})
              </CardTitle>
            </div>
            {canEdit && (
              <Link href={`/tasks/new?eventId=${id}`}>
                <Button size="sm" variant="outline"
                  className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30">
                  <Plus className="h-4 w-4 mr-1" /> Add Task
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-green-700/70 dark:text-slate-500 text-center py-4">
                No tasks linked to this event yet.
              </p>
            ) : (
              <div className="divide-y divide-green-50 dark:divide-slate-800">
                {tasks.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`}
                    className="block py-3 hover:bg-green-50/40 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-green-950 dark:text-slate-100">{t.title}</p>
                      <div className="flex gap-2 shrink-0">
                        <Badge className={cn("capitalize", PRIORITY_STYLE[t.priority as keyof typeof PRIORITY_STYLE] ?? "")}>{t.priority}</Badge>
                        <Badge className={cn("capitalize", TASK_STATUS_STYLE[t.status as keyof typeof TASK_STATUS_STYLE] ?? "")}>{t.status.replace("_", " ")}</Badge>
                      </div>
                    </div>
                    {t.assignedTo && (
                      <p className="text-xs text-green-700/70 dark:text-slate-400 mt-0.5">Assigned to {t.assignedTo}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
