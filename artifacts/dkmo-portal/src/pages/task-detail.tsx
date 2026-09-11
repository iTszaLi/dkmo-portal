import { useEffect, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import {
  useGetTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getGetTaskQueryKey,
  useListSponsors,
  useListEvents,
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
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getReturnTarget, useReturnNavigation, withReturnTo } from "@/lib/navigation";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
type Priority = (typeof PRIORITIES)[number];
type TaskStatus = (typeof TASK_STATUSES)[number];

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
  high:   "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  medium: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  low:    "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending:     "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  in_progress: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  completed:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  cancelled:   "bg-slate-100 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-500",
};

interface FormState {
  title: string;
  description: string;
  assignedTo: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  sponsorId: string;
  eventId: string;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  assignedTo: "",
  priority: "medium",
  status: "pending",
  dueDate: "",
  sponsorId: "",
  eventId: "",
};

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const [, setLocation] = useLocation();
  const goBack = useReturnNavigation("/tasks");
  const backHref = getReturnTarget("/tasks");
  const search = useSearch();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const id = params?.id;
  const isNew = id === "new";

  const qs = new URLSearchParams(search);
  const prefilledSponsorId = qs.get("sponsorId") ?? "";
  const prefilledEventId = qs.get("eventId") ?? "";

  const { data: task, isLoading } = useGetTask(id ?? "", {
    query: { enabled: !!id && !isNew, queryKey: getGetTaskQueryKey(id ?? "") },
  });

  const { data: sponsorsData } = useListSponsors({ pageSize: 200 });
  const { data: eventsData } = useListEvents({ pageSize: 200 });

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY,
    sponsorId: prefilledSponsorId,
    eventId: prefilledEventId,
  }));
  const [editing, setEditing] = useState(isNew);

  useEffect(() => {
    if (!isNew && task) {
      setForm({
        title: task.title,
        description: task.description,
        assignedTo: task.assignedTo,
        priority: task.priority as Priority,
        status: task.status as TaskStatus,
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
        sponsorId: task.sponsorId ?? "",
        eventId: task.eventId ?? "",
      });
    }
  }, [task, isNew]);

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: (created) => {
        toast({ title: "Task created" });
        setLocation(withReturnTo(`/tasks/${created.id}`, getReturnTarget("/tasks")));
      },
      onError: (err) =>
        toast({ title: "Could not create", description: String(err), variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Saved" });
        goBack();
      },
      onError: (err) =>
        toast({ title: "Could not save", description: String(err), variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Task deleted" });
        setLocation(getReturnTarget("/tasks"));
      },
      onError: (err) =>
        toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
    },
  });

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Task title is required", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description,
      assignedTo: form.assignedTo.trim(),
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate ? new Date(form.dueDate + "T00:00:00.000Z").toISOString() : null,
      sponsorId: form.sponsorId || null,
      eventId: form.eventId || null,
    };
    if (isNew) {
      createMutation.mutate({ data: payload });
    } else if (id) {
      updateMutation.mutate({ id, data: payload });
    }
  };

  const onDelete = () => {
    if (!task || !id) return;
    if (!confirm(`Delete task "${task.title}"?`)) return;
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

  if (!isNew && !task && !isLoading) {
    return (
      <div className="text-center py-12 text-green-700/70 dark:text-slate-500">
        Task not found.{" "}
        <Link href={backHref} className="text-green-800 dark:text-green-400 underline">Back</Link>
      </div>
    );
  }

  const sponsors = sponsorsData?.items ?? [];
  const events = eventsData?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}
            className="text-green-800 dark:text-green-400 hover:bg-green-50 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">
              {isNew ? "New Task" : task!.title}
            </h1>
            {!isNew && task && (
              <div className="flex gap-2 mt-1">
                <Badge className={cn("capitalize", PRIORITY_STYLE[task.priority as Priority])}>{task.priority}</Badge>
                <Badge className={cn("capitalize", STATUS_STYLE[task.status as TaskStatus])}>{task.status.replace("_", " ")}</Badge>
              </div>
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
            <CardTitle className="text-base text-green-950 dark:text-green-100">Task Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="title" className="dark:text-slate-300">Task Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                disabled={!editing}
                placeholder="Follow up with sponsor for payment"
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="assignedTo" className="dark:text-slate-300">Assigned To</Label>
              <Input
                id="assignedTo"
                value={form.assignedTo}
                onChange={(e) => set("assignedTo", e.target.value)}
                disabled={!editing}
                placeholder="admin1"
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="dueDate" className="dark:text-slate-300">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                disabled={!editing}
                className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="priority" className="dark:text-slate-300">Priority</Label>
              {editing ? (
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1">
                  <Badge className={cn("capitalize", PRIORITY_STYLE[form.priority])}>{form.priority}</Badge>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="status" className="dark:text-slate-300">Status</Label>
              {editing ? (
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1">
                  <Badge className={cn("capitalize", STATUS_STYLE[form.status])}>{form.status.replace("_", " ")}</Badge>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="sponsorId" className="dark:text-slate-300">Linked Sponsor</Label>
              {editing ? (
                <Select value={form.sponsorId || "none"} onValueChange={(v) => set("sponsorId", v === "none" ? "" : v)}>
                  <SelectTrigger className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {sponsors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.sponsorName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm text-green-900 dark:text-slate-200">
                  {task?.sponsorName ? (
                    <Link href={withReturnTo(`/sponsors/${task.sponsorId}`)}
                      className="underline text-green-800 dark:text-green-400 hover:text-green-600">
                      {task.sponsorName}
                    </Link>
                  ) : "—"}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="eventId" className="dark:text-slate-300">Linked Event</Label>
              {editing ? (
                <Select value={form.eventId || "none"} onValueChange={(v) => set("eventId", v === "none" ? "" : v)}>
                  <SelectTrigger className="dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm text-green-900 dark:text-slate-200">
                  {task?.eventName ? (
                    <Link href={withReturnTo(`/events/${task.eventId}`)}
                      className="underline text-green-800 dark:text-green-400 hover:text-green-600">
                      {task.eventName}
                    </Link>
                  ) : "—"}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="description" className="dark:text-slate-300">Description / Notes</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={!editing}
                rows={3}
                placeholder="Detailed notes or next steps…"
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
              {isNew ? "Create Task" : "Save Changes"}
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
    </div>
  );
}
