import { useRef, useState } from "react";
import {
  useListJobListings,
  useGetJobBureauStats,
  useCreateJobListing,
  useUpdateJobListing,
  useDeleteJobListing,
  useListJobApplications,
  useCreateJobApplication,
  useUpdateJobApplication,
  useDeleteJobApplication,
  getListJobListingsQueryKey,
  getGetJobBureauStatsQueryKey,
  getListJobApplicationsQueryKey,
  type JobListing,
  type JobApplication,
  type JobDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Briefcase,
  MapPin,
  Building2,
  Trash2,
  Users,
  CheckCircle2,
  Upload,
  FileText,
  X,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const LISTING_STATUSES = ["open", "closed", "filled"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"] as const;
const APPLICATION_STATUSES = ["applied", "shortlisted", "interviewed", "placed", "rejected"] as const;

const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

const LISTING_STATUS_STYLE: Record<string, string> = {
  open: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700/50",
  filled: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700/50",
  closed: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700/50",
};

const APP_STATUS_STYLE: Record<string, string> = {
  applied: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700/50",
  shortlisted: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700/50",
  interviewed: "bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700/50",
  placed: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700/50",
  rejected: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700/50",
};

interface ListingForm {
  title: string;
  company: string;
  location: string;
  jobType: (typeof JOB_TYPES)[number];
  salaryRange: string;
  description: string;
  contactPerson: string;
  contactNumber: string;
  contactEmail: string;
  status: (typeof LISTING_STATUSES)[number];
}

const emptyListingForm: ListingForm = {
  title: "",
  company: "",
  location: "",
  jobType: "full_time",
  salaryRange: "",
  description: "",
  contactPerson: "",
  contactNumber: "",
  contactEmail: "",
  status: "open",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Briefcase;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-green-950 dark:text-slate-100">{value}</div>
          <div className="text-xs text-green-700/70 dark:text-slate-400">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function JobBureau() {
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  function invalidateListings() {
    queryClient.invalidateQueries({ queryKey: getListJobListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetJobBureauStatsQueryKey() });
  }

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<JobListing | null>(null);

  const queryParams = {
    ...(search ? { search } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter as (typeof LISTING_STATUSES)[number] } : {}),
  };

  const { data: stats } = useGetJobBureauStats();
  const { data: listings, isLoading, refetch: refetchListings } = useListJobListings(queryParams);

  // ---- Listing dialog ----
  const [listingDialogOpen, setListingDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<JobListing | null>(null);
  const [listingForm, setListingForm] = useState<ListingForm>(emptyListingForm);

  const createListing = useCreateJobListing();
  const updateListing = useUpdateJobListing();
  const deleteListing = useDeleteJobListing();

  function openCreateListing() {
    setEditingListing(null);
    setListingForm(emptyListingForm);
    setListingDialogOpen(true);
  }

  function openEditListing(l: JobListing) {
    setEditingListing(l);
    setListingForm({
      title: l.title,
      company: l.company,
      location: l.location,
      jobType: l.jobType as ListingForm["jobType"],
      salaryRange: l.salaryRange,
      description: l.description,
      contactPerson: l.contactPerson,
      contactNumber: l.contactNumber,
      contactEmail: l.contactEmail,
      status: l.status as ListingForm["status"],
    });
    setListingDialogOpen(true);
  }

  async function submitListing() {
    if (!listingForm.title.trim()) {
      toast({ title: "Job title is required", variant: "destructive" });
      return;
    }
    try {
      if (editingListing) {
        await updateListing.mutateAsync({ id: editingListing.id, data: listingForm });
        toast({ title: "Listing updated" });
      } else {
        await createListing.mutateAsync({ data: listingForm });
        toast({ title: "Listing posted" });
      }
      setListingDialogOpen(false);
      invalidateListings();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    }
  }

  function onDeleteListing(l: JobListing) {
    if (!confirm(`Delete listing "${l.title}"? This also removes its applications.`)) return;
    deleteListing.mutate(
      { id: l.id },
      {
        onSuccess: () => {
          toast({ title: "Listing deleted" });
          if (selected?.id === l.id) setSelected(null);
          invalidateListings();
        },
        onError: (err) =>
          toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
      },
    );
  }

  const items = listings ?? [];

  if (selected) {
    return (
      <ApplicationsView
        listing={selected}
        onBack={() => {
          setSelected(null);
          invalidateListings();
        }}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">Job Bureau</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400">
            Post jobs, collect applications with CVs, and track member placements.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={openCreateListing}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
            data-testid="button-add-listing"
          >
            <Plus className="h-4 w-4 mr-1" /> Post Job
          </Button>
        )}
      </div>

      {/* Placement summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Briefcase}
          label="Jobs posted"
          value={stats?.totalListings ?? 0}
          tone="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400"
        />
        <StatCard
          icon={Briefcase}
          label="Open positions"
          value={stats?.openListings ?? 0}
          tone="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
        />
        <StatCard
          icon={Users}
          label="Total applicants"
          value={stats?.totalApplications ?? 0}
          tone="bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Placements"
          value={stats?.placements ?? 0}
          tone="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
        />
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">Job listings</CardTitle>
              <CardDescription className="dark:text-slate-400">
                {isLoading ? "Loading…" : `${items.length} listing${items.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-auto">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-green-700/50 dark:text-slate-500" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  data-testid="input-listing-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" data-testid="select-listing-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All statuses</SelectItem>
                  {LISTING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-green-700/70 dark:text-slate-500">
              <Briefcase className="h-10 w-10 mx-auto mb-2 text-green-700/40 dark:text-slate-700" />
              No job listings yet.
              {canEdit && (
                <div className="mt-3">
                  <Button
                    onClick={openCreateListing}
                    variant="outline"
                    className="border-green-300 dark:border-slate-700 text-green-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Post your first job
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((l) => (
                <Card
                  key={l.id}
                  className="group rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900/60 hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer"
                  onClick={() => setSelected(l)}
                  data-testid={`card-listing-${l.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-green-950 dark:text-slate-100 truncate">{l.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-green-700/70 dark:text-slate-400">
                          {l.company && (
                            <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{l.company}</span>
                          )}
                          {l.location && (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>
                          )}
                          <span>{JOB_TYPE_LABEL[l.jobType] ?? l.jobType}</span>
                        </div>
                      </div>
                      <Badge className={cn("capitalize text-[11px] shrink-0", LISTING_STATUS_STYLE[l.status] ?? "")}>
                        {l.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-green-800/80 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{l.applicationCount} applicant{l.applicationCount === 1 ? "" : "s"}</span>
                        {l.placedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" />{l.placedCount} placed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-800 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
                            onClick={() => openEditListing(l)}
                            data-testid={`button-edit-listing-${l.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => onDeleteListing(l)}
                            data-testid={`button-delete-listing-${l.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listing dialog */}
      <Dialog open={listingDialogOpen} onOpenChange={setListingDialogOpen}>
        <DialogContent className="max-w-lg dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-green-100">
              {editingListing ? "Edit listing" : "Post a job"}
            </DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Fill in the job details. Applicants and CVs are managed inside the listing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="dark:text-slate-300">Job title *</Label>
              <Input
                value={listingForm.title}
                onChange={(e) => setListingForm((f) => ({ ...f, title: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                data-testid="input-listing-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="dark:text-slate-300">Company</Label>
                <Input
                  value={listingForm.company}
                  onChange={(e) => setListingForm((f) => ({ ...f, company: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <Label className="dark:text-slate-300">Location</Label>
                <Input
                  value={listingForm.location}
                  onChange={(e) => setListingForm((f) => ({ ...f, location: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="dark:text-slate-300">Job type</Label>
                <Select
                  value={listingForm.jobType}
                  onValueChange={(v) => setListingForm((f) => ({ ...f, jobType: v as ListingForm["jobType"] }))}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {JOB_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="dark:text-slate-300 dark:focus:bg-slate-800">{JOB_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="dark:text-slate-300">Status</Label>
                <Select
                  value={listingForm.status}
                  onValueChange={(v) => setListingForm((f) => ({ ...f, status: v as ListingForm["status"] }))}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {LISTING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="dark:text-slate-300">Salary range</Label>
              <Input
                value={listingForm.salaryRange}
                onChange={(e) => setListingForm((f) => ({ ...f, salaryRange: e.target.value }))}
                placeholder="e.g. 4,000–6,000 SAR / month"
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <Label className="dark:text-slate-300">Description</Label>
              <Textarea
                value={listingForm.description}
                onChange={(e) => setListingForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="dark:text-slate-300">Contact person</Label>
                <Input
                  value={listingForm.contactPerson}
                  onChange={(e) => setListingForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <Label className="dark:text-slate-300">Phone</Label>
                <Input
                  value={listingForm.contactNumber}
                  onChange={(e) => setListingForm((f) => ({ ...f, contactNumber: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <Label className="dark:text-slate-300">Email</Label>
                <Input
                  value={listingForm.contactEmail}
                  onChange={(e) => setListingForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListingDialogOpen(false)} className="dark:border-slate-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={submitListing}
              disabled={createListing.isPending || updateListing.isPending}
              className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
              data-testid="button-save-listing"
            >
              {editingListing ? "Save changes" : "Post job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AppForm {
  applicantName: string;
  membershipId: string;
  contactNumber: string;
  contactEmail: string;
  status: (typeof APPLICATION_STATUSES)[number];
  notes: string;
}

const emptyAppForm: AppForm = {
  applicantName: "",
  membershipId: "",
  contactNumber: "",
  contactEmail: "",
  status: "applied",
  notes: "",
};

function ApplicationsView({
  listing,
  onBack,
  canEdit,
  canDelete,
}: {
  listing: JobListing;
  onBack: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: apps, isLoading, refetch } = useListJobApplications(listing.id);

  const createApp = useCreateJobApplication();
  const updateApp = useUpdateJobApplication();
  const deleteApp = useDeleteJobApplication();

  function refreshAfterAppChange() {
    refetch();
    queryClient.invalidateQueries({ queryKey: getListJobApplicationsQueryKey(listing.id) });
    queryClient.invalidateQueries({ queryKey: getListJobListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetJobBureauStatsQueryKey() });
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AppForm>(emptyAppForm);
  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  function openCreate() {
    setForm(emptyAppForm);
    setDocs([]);
    setDialogOpen(true);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await fetch(`${basePath}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json();
      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");
      const viewUrl = `${basePath}/api/storage${objectPath}`;
      setDocs((d) => [...d, { name: file.name, url: viewUrl, uploadedAt: new Date().toISOString() }]);
      toast({ title: "CV uploaded" });
    } catch (e) {
      toast({ title: "Upload error", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submit() {
    if (!form.applicantName.trim()) {
      toast({ title: "Applicant name is required", variant: "destructive" });
      return;
    }
    try {
      await createApp.mutateAsync({
        id: listing.id,
        data: { ...form, cvDocuments: docs },
      });
      toast({ title: "Application added" });
      setDialogOpen(false);
      refreshAfterAppChange();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    }
  }

  function changeStatus(app: JobApplication, status: string) {
    updateApp.mutate(
      { id: app.id, data: { status: status as AppForm["status"] } },
      {
        onSuccess: () => {
          toast({ title: "Status updated" });
          refreshAfterAppChange();
        },
        onError: (err) =>
          toast({ title: "Update failed", description: String(err), variant: "destructive" }),
      },
    );
  }

  function onDelete(app: JobApplication) {
    if (!confirm(`Delete application from "${app.applicantName}"?`)) return;
    deleteApp.mutate(
      { id: app.id },
      {
        onSuccess: () => {
          toast({ title: "Application deleted" });
          refreshAfterAppChange();
        },
        onError: (err) =>
          toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
      },
    );
  }

  const items = apps ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-green-800 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800 -ml-2"
          data-testid="button-back-listings"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to listings
        </Button>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-green-950 dark:text-green-100">{listing.title}</h1>
                <Badge className={cn("capitalize text-[11px]", LISTING_STATUS_STYLE[listing.status] ?? "")}>
                  {listing.status}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-green-700/70 dark:text-slate-400">
                {listing.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{listing.company}</span>}
                {listing.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.location}</span>}
                <span>{JOB_TYPE_LABEL[listing.jobType] ?? listing.jobType}</span>
                {listing.salaryRange && <span>· {listing.salaryRange}</span>}
              </div>
              {listing.description && (
                <p className="mt-3 text-sm text-green-800/80 dark:text-slate-400 max-w-2xl whitespace-pre-line">{listing.description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-green-950 dark:text-green-100">Applications</CardTitle>
            <CardDescription className="dark:text-slate-400">
              {isLoading ? "Loading…" : `${items.length} applicant${items.length === 1 ? "" : "s"}`}
            </CardDescription>
          </div>
          {canEdit && (
            <Button
              onClick={openCreate}
              className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
              data-testid="button-add-application"
            >
              <Plus className="h-4 w-4 mr-1" /> Add applicant
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-green-700/70 dark:text-slate-500">
              <Users className="h-9 w-9 mx-auto mb-2 text-green-700/40 dark:text-slate-700" />
              No applications yet.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-green-100 dark:border-slate-800 p-3"
                  data-testid={`row-application-${a.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-green-950 dark:text-slate-200">{a.applicantName}</div>
                    <div className="text-xs text-green-700/70 dark:text-slate-500 flex flex-wrap gap-x-3">
                      {a.membershipId && <span>ID: {a.membershipId}</span>}
                      {a.contactNumber && <span>{a.contactNumber}</span>}
                      {a.contactEmail && <span>{a.contactEmail}</span>}
                    </div>
                    {a.cvDocuments.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {a.cvDocuments.map((d, i) => (
                          <a
                            key={i}
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 hover:underline"
                            data-testid={`link-cv-${a.id}-${i}`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {d.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <Select value={a.status} onValueChange={(v) => changeStatus(a, v)}>
                        <SelectTrigger className="h-8 w-36 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" data-testid={`select-app-status-${a.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                          {APPLICATION_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={cn("capitalize text-[11px]", APP_STATUS_STYLE[a.status] ?? "")}>{a.status}</Badge>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => onDelete(a)}
                        data-testid={`button-delete-application-${a.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Application dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-green-100">Add applicant</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Record an applicant for “{listing.title}”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="dark:text-slate-300">Applicant name *</Label>
              <Input
                value={form.applicantName}
                onChange={(e) => setForm((f) => ({ ...f, applicantName: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                data-testid="input-applicant-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="dark:text-slate-300">Membership ID</Label>
                <Input
                  value={form.membershipId}
                  onChange={(e) => setForm((f) => ({ ...f, membershipId: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <Label className="dark:text-slate-300">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as AppForm["status"] }))}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {APPLICATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="dark:text-slate-300">Phone</Label>
                <Input
                  value={form.contactNumber}
                  onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <Label className="dark:text-slate-300">Email</Label>
                <Input
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
            <div>
              <Label className="dark:text-slate-300">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <Label className="dark:text-slate-300">CV / documents</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-1 w-full border-green-300 dark:border-slate-700 text-green-800 dark:text-slate-300 dark:hover:bg-slate-800"
                data-testid="button-upload-cv"
              >
                <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload CV"}
              </Button>
              {docs.length > 0 && (
                <div className="mt-2 space-y-1">
                  {docs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-green-50/60 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-green-800 dark:text-slate-300 truncate">
                        <FileText className="h-3.5 w-3.5 shrink-0" /> {d.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDocs((arr) => arr.filter((_, idx) => idx !== i))}
                        className="text-red-600 dark:text-red-400 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:border-slate-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={createApp.isPending || uploading}
              className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
              data-testid="button-save-application"
            >
              Add applicant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
