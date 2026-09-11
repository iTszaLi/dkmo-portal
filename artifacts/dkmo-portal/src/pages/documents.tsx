import { useState, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import { format } from "date-fns";
import {
  FolderOpen, Upload, Search, Eye, Trash2, Edit, History,
  FileText, FileImage, File, Plus, X, Tag, Paperclip, Globe,
  Users, Shield, Lock, ScrollText, ChevronDown, AlertTriangle,
  CheckCircle, Archive, Download, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { customFetch } from "@workspace/api-client-react";
import {
  useListDocuments, useCreateDocument, useUpdateDocument,
  useDeleteDocument, useListDocumentVersions, useAddDocumentVersion,
  useListDocumentAttachments, useAddDocumentAttachment, useDeleteDocumentAttachment,
  useDocumentActivity, trackDocument,
  type DocumentRecord, type DocumentCategory, type DocumentStatus,
  type DocumentInput, type DocumentVisibility,
} from "@workspace/api-client-react";

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "general",        label: "General" },
  { value: "member_docs",    label: "Member Documents" },
  { value: "frf_docs",       label: "FRF Documents" },
  { value: "loan_docs",      label: "Loan Documents" },
  { value: "committee_docs", label: "Committee Documents" },
  { value: "financial",      label: "Financial" },
  { value: "legal",          label: "Legal" },
  { value: "minutes",        label: "Meeting Minutes" },
  { value: "other",          label: "Other" },
];

const STATUS_MAP = {
  active:   { label: "Active",   color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  expired:  { label: "Expired",  color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  archived: { label: "Archived", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
} as const;

const VISIBILITY_MAP: Record<DocumentVisibility, { label: string; icon: typeof Globe; color: string; desc: string }> = {
  public:    { label: "Public",         icon: Globe,  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",       desc: "Anyone can view (public portal)" },
  members:   { label: "Members Only",   icon: Users,  color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   desc: "All logged-in users" },
  committee: { label: "Committee Only", icon: Shield, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",   desc: "Committee & admin accounts" },
  admin:     { label: "Admin Only",     icon: Lock,   color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",           desc: "Administrators only" },
};

const ACTION_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  viewed: "Viewed",
  downloaded: "Downloaded",
  edited: "Edited",
  version_added: "New version",
  attachment_added: "Attachment added",
  attachment_removed: "Attachment removed",
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(mimeType: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return mimeType.toLowerCase().startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
}
function isPdfFile(mimeType: string, fileName: string) {
  return mimeType.toLowerCase().includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
}

function fileIcon(mimeType: string, fileName: string) {
  if (isImageFile(mimeType, fileName))
    return <FileImage className="h-4 w-4 text-blue-500 shrink-0" />;
  if (isPdfFile(mimeType, fileName))
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  return <File className="h-4 w-4 text-slate-500 shrink-0" />;
}

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const d = new Date(expiryDate);
  return d > new Date() && d <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

interface PendingFile { fileUrl: string; fileName: string; fileSize: number; mimeType: string }

const emptyForm = (): DocumentInput & { tags: string } => ({
  title: "", description: "", category: "general", tags: "",
  fileUrl: "", fileName: "", fileSize: 0, mimeType: "",
  expiryDate: null, status: "active", notes: "", visibility: "members",
  linkedEntityId: "", linkedEntityType: "",
});

async function uploadToStorage(file: globalThis.File): Promise<PendingFile> {
  const res = await customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
  );
  await fetch(res.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return {
    fileUrl: `/api/storage/public-objects/${res.objectPath}`,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const { user, canEdit, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const searchString = useSearch();
  const initialParams = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const [search, setSearch]                 = useState(() => initialParams.get("search") ?? "");
  const [categoryFilter, setCategory]       = useState("all");
  const [statusFilter, setStatus]           = useState(() => initialParams.get("status") ?? "all");
  const [visibilityFilter, setVisibility]   = useState("all");
  const [expiringOnly, setExpiringOnly]     = useState(() => initialParams.get("expiring") === "true");
  const [showUpload, setShowUpload]         = useState(false);
  const [editingDoc, setEditingDoc]         = useState<DocumentRecord | null>(null);
  const [versionDocId, setVersionDocId]     = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId]       = useState<string | null>(null);
  const [attachmentsDoc, setAttachmentsDoc] = useState<DocumentRecord | null>(null);
  const [activityDoc, setActivityDoc]       = useState<DocumentRecord | null>(null);
  const [previewDoc, setPreviewDoc]         = useState<{ title: string; fileUrl: string; fileName: string; mimeType: string } | null>(null);
  const [uploading, setUploading]           = useState(false);
  const [form, setForm]                     = useState(emptyForm());
  const [pendingFiles, setPendingFiles]     = useState<PendingFile[]>([]);
  const [newVer, setNewVer]                 = useState({ fileUrl: "", fileName: "", fileSize: 0, notes: "" });

  const { data, isLoading, refetch } = useListDocuments({
    search: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    visibility: visibilityFilter !== "all" ? visibilityFilter : undefined,
    pageSize: 50,
  });

  const { data: versions, isLoading: versionsLoading } = useListDocumentVersions(versionDocId ?? "");
  const { data: attachments, isLoading: attachmentsLoading } = useListDocumentAttachments(attachmentsDoc?.id ?? "");
  const { data: activity, isLoading: activityLoading } = useDocumentActivity(activityDoc?.id ?? "");

  const createMut  = useCreateDocument();
  const deleteMut  = useDeleteDocument();
  const addVerMut  = useAddDocumentVersion(versionDocId ?? "");
  const updateMut  = useUpdateDocument(editingDoc?.id ?? "");
  const addAttMut  = useAddDocumentAttachment(attachmentsDoc?.id ?? "");
  const delAttMut  = useDeleteDocumentAttachment(attachmentsDoc?.id ?? "");

  const allDocs = data?.items ?? [];
  const docs    = expiringOnly ? allDocs.filter((d) => isExpiringSoon(d.expiryDate)) : allDocs;
  const total   = data?.total ?? 0;

  const catLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, target: "form" | "ver") => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const up = await uploadToStorage(file);
        if (target === "form") setForm((p) => ({ ...p, ...up }));
        else setNewVer((p) => ({ ...p, fileUrl: up.fileUrl, fileName: up.fileName, fileSize: up.fileSize }));
        toast({ title: "File uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  /** Multi-file upload for supporting attachments (form or attachments dialog). */
  const handleMultiUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, onDone: (files: PendingFile[]) => void | Promise<void>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      setUploading(true);
      try {
        const uploaded: PendingFile[] = [];
        for (const f of files) uploaded.push(await uploadToStorage(f));
        await onDone(uploaded);
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  const closeForm = () => { setShowUpload(false); setEditingDoc(null); setForm(emptyForm()); setPendingFiles([]); };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    try {
      if (editingDoc) {
        await updateMut.mutateAsync(form);
        toast({ title: "Document updated" });
      } else {
        const created = await createMut.mutateAsync(form);
        for (const f of pendingFiles) {
          await customFetch(`/api/documents/${created.id}/attachments`, {
            method: "POST",
            body: JSON.stringify(f),
          });
        }
        toast({ title: pendingFiles.length > 0 ? `Document uploaded with ${pendingFiles.length} attachment${pendingFiles.length > 1 ? "s" : ""}` : "Document uploaded" });
      }
      closeForm();
      void refetch();
    } catch (err) {
      toast({ title: "Failed to save", description: String(err), variant: "destructive" });
    }
  };

  const openView = (doc: { id?: string; title: string; fileUrl: string; fileName: string; mimeType: string }, track = true) => {
    if (!doc.fileUrl) return;
    if (track && doc.id) trackDocument(doc.id, "viewed", doc.fileName);
    if (isPdfFile(doc.mimeType, doc.fileName) || isImageFile(doc.mimeType, doc.fileName)) {
      setPreviewDoc(doc);
    } else {
      window.open(doc.fileUrl, "_blank");
    }
  };

  const downloadFile = (fileUrl: string, fileName: string, docId?: string) => {
    if (docId) trackDocument(docId, "downloaded", fileName);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    a.click();
    setTimeout(() => void refetch(), 800);
  };

  const expiringSoon = allDocs.filter((d) => isExpiringSoon(d.expiryDate)).length;

  const statCards = [
    { label: "Total",         value: total,                                                  icon: FolderOpen,    color: "text-green-700 dark:text-green-400",
      active: statusFilter === "all" && !expiringOnly,
      onClick: () => { setStatus("all"); setExpiringOnly(false); } },
    { label: "Active",        value: allDocs.filter((d) => d.status === "active").length,    icon: CheckCircle,   color: "text-green-600 dark:text-green-400",
      active: statusFilter === "active" && !expiringOnly,
      onClick: () => { setExpiringOnly(false); setStatus((s) => (s === "active" ? "all" : "active")); } },
    { label: "Expiring Soon", value: expiringSoon,                                           icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400",
      active: expiringOnly,
      onClick: () => { setStatus("all"); setExpiringOnly((v) => !v); } },
    { label: "Archived",      value: allDocs.filter((d) => d.status === "archived").length,  icon: Archive,       color: "text-slate-500 dark:text-slate-400",
      active: statusFilter === "archived" && !expiringOnly,
      onClick: () => { setExpiringOnly(false); setStatus((s) => (s === "archived" ? "all" : "archived")); } },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Documents</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            DKMO document archive — {total} document{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.open(`${import.meta.env.BASE_URL}dkmo-documents`, "_blank")}
            className="gap-2 border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300" data-testid="button-public-portal">
            <Globe className="h-4 w-4" /> Public Portal
          </Button>
          {canEdit && (
            <Button
              onClick={() => { setForm(emptyForm()); setPendingFiles([]); setShowUpload(true); }}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 text-white gap-2"
              data-testid="button-upload-document"
            >
              <Upload className="h-4 w-4" /> Upload Document
            </Button>
          )}
        </div>
      </div>

      {/* Stats — clickable filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, active, onClick }) => (
          <button key={label} type="button" onClick={onClick} aria-pressed={active}
            className="text-left focus-visible:outline-none group" data-testid={`button-doc-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
            <Card className={cn(
              "rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all",
              "group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-hover:-translate-y-0.5",
              active && label !== "Total" && "ring-2 ring-green-500 dark:ring-green-400",
            )}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <div>
                    <p className="text-2xl font-bold text-green-950 dark:text-white">{isLoading ? "…" : value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60" />
          <Input
            placeholder="Search title, tags, description, file name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48 border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={visibilityFilter} onValueChange={setVisibility}>
          <SelectTrigger className="w-full sm:w-44 border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
            <SelectValue placeholder="All visibility" />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
            <SelectItem value="all">All visibility</SelectItem>
            {(Object.keys(VISIBILITY_MAP) as DocumentVisibility[]).map((v) => (
              <SelectItem key={v} value={v}>{VISIBILITY_MAP[v].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setExpiringOnly(false); setStatus(v); }}>
          <SelectTrigger className="w-full sm:w-36 border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-100 dark:border-slate-800 bg-green-50/50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300">Document</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden xl:table-cell">Tags</th>
                <th className="text-center px-4 py-3 font-semibold text-green-900 dark:text-green-300">Attachments</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden lg:table-cell">Visibility</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden lg:table-cell">Expiry</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden md:table-cell">Uploaded</th>
                <th className="text-right px-4 py-3 font-semibold text-green-900 dark:text-green-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-green-50 dark:border-slate-800">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : docs.length === 0
                ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <FolderOpen className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                      <p className="text-slate-500 dark:text-slate-400 font-medium">No documents found</p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{canEdit ? 'Click "Upload Document" to add the first one' : "No documents match the current filters"}</p>
                    </td>
                  </tr>
                )
                : docs.map((doc) => {
                  const si = STATUS_MAP[doc.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.active;
                  const vi = VISIBILITY_MAP[doc.visibility] ?? VISIBILITY_MAP.members;
                  const VIcon = vi.icon;
                  const soon = isExpiringSoon(doc.expiryDate);
                  return (
                    <tr key={doc.id} className="border-b border-green-50 dark:border-slate-800 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-start gap-2">
                          {fileIcon(doc.mimeType, doc.fileName)}
                          <div className="min-w-0">
                            <p className="font-medium text-green-950 dark:text-slate-100 truncate">{doc.title}</p>
                            {doc.fileName && <p className="text-xs text-slate-400 truncate">{doc.fileName}</p>}
                            <div className="flex items-center gap-2">
                              {doc.version > 1 && <span className="text-xs text-blue-500">v{doc.version}</span>}
                              {doc.downloadCount > 0 && (
                                <span className="text-xs text-slate-400 flex items-center gap-0.5">
                                  <Download className="h-3 w-3" /> {doc.downloadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline" className="text-xs border-green-200 dark:border-slate-700 text-green-700 dark:text-green-400">
                          {catLabel(doc.category)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[140px]">
                        {doc.tags
                          ? doc.tags.split(",").filter(Boolean).slice(0, 2).map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs mr-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {t.trim()}
                              </Badge>
                            ))
                          : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setAttachmentsDoc(doc)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            doc.attachmentsCount > 0
                              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
                          )}
                          data-testid={`button-attachments-${doc.id}`}
                        >
                          <Paperclip className="h-3 w-3" /> {doc.attachmentsCount}
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <Badge className={`text-xs gap-1 ${vi.color}`}>
                          <VIcon className="h-3 w-3" /> {vi.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${si.color}`}>{si.label}</Badge>
                        {soon && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-amber-600 dark:text-amber-400">Expiring soon</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                        {doc.expiryDate
                          ? <span className={soon ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                              {format(new Date(doc.expiryDate), "dd MMM yyyy")}
                            </span>
                          : "—"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                        <div>{doc.uploadedBy || "—"}</div>
                        <div className="text-slate-400">{format(new Date(doc.createdAt), "dd MMM yyyy")}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-1 text-slate-600 dark:text-slate-400" data-testid={`button-actions-${doc.id}`}>
                              Actions <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 dark:bg-slate-900 dark:border-slate-800">
                            {doc.fileUrl && (
                              <DropdownMenuItem onClick={() => openView(doc)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Eye className="h-4 w-4 text-green-600" /> View
                              </DropdownMenuItem>
                            )}
                            {doc.fileUrl && (
                              <DropdownMenuItem
                                onClick={() => downloadFile(doc.fileUrl, doc.fileName || doc.title, doc.id)}
                                className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800"
                              >
                                <Download className="h-4 w-4 text-blue-500" /> Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setAttachmentsDoc(doc)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Paperclip className="h-4 w-4 text-teal-600" /> Attachments ({doc.attachmentsCount})
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem
                              onClick={() => { setVersionDocId(doc.id); setNewVer({ fileUrl: "", fileName: "", fileSize: 0, notes: "" }); }}
                              className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800"
                            >
                              <History className="h-4 w-4 text-purple-500" /> Version History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setActivityDoc(doc)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <ScrollText className="h-4 w-4 text-slate-500" /> Audit Log
                            </DropdownMenuItem>
                            {canEdit && (
                              <>
                                <DropdownMenuSeparator className="dark:border-slate-700" />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingDoc(doc);
                                    setForm({
                                      title: doc.title, description: doc.description, category: doc.category as DocumentCategory,
                                      tags: doc.tags, fileUrl: doc.fileUrl, fileName: doc.fileName, fileSize: doc.fileSize,
                                      mimeType: doc.mimeType, expiryDate: doc.expiryDate, status: doc.status as DocumentStatus,
                                      notes: doc.notes, linkedEntityId: doc.linkedEntityId, linkedEntityType: doc.linkedEntityType,
                                      visibility: doc.visibility,
                                    });
                                  }}
                                  className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800"
                                >
                                  <Edit className="h-4 w-4 text-blue-500" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteDocId(doc.id)} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                                  <Trash2 className="h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upload / Edit Dialog */}
      <Dialog open={showUpload || !!editingDoc} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100">
              {editingDoc ? "Edit Document" : "Upload Document"}
            </DialogTitle>
            <DialogDescription>{editingDoc ? "Update document metadata." : "Add a new document to the archive."}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Title <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Lease Agreement 2025" className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
            </div>
            <div>
              <Label className="text-xs font-medium">Category</Label>
              <Select value={form.category as string} onValueChange={(v) => setForm((p) => ({ ...p, category: v as DocumentCategory }))}>
                <SelectTrigger className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"><SelectValue /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Status</Label>
              <Select value={form.status as string} onValueChange={(v) => setForm((p) => ({ ...p, status: v as DocumentStatus }))}>
                <SelectTrigger className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"><SelectValue /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Visibility</Label>
              <Select value={form.visibility as string} onValueChange={(v) => setForm((p) => ({ ...p, visibility: v as DocumentVisibility }))}>
                <SelectTrigger className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"><SelectValue /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  {(Object.keys(VISIBILITY_MAP) as DocumentVisibility[]).map((v) => {
                    const { label, icon: VIcon, desc } = VISIBILITY_MAP[v];
                    const restricted = (v === "public" || v === "admin") && !isAdmin;
                    return (
                      <SelectItem key={v} value={v} disabled={restricted}>
                        <span className="flex items-center gap-2">
                          <VIcon className="h-3.5 w-3.5" /> {label}
                          <span className="text-xs text-slate-400">— {desc}{restricted ? " (admin only)" : ""}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.visibility === "public" && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                  <Globe className="h-3 w-3" /> This document will appear on the public portal without login.
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Tags (comma-separated)</Label>
              <div className="relative mt-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="e.g. 2025, legal, approved" className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Expiry Date</Label>
              <Input type="date" value={form.expiryDate ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value || null }))}
                className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
            </div>
            <div>
              <Label className="text-xs font-medium">Main File</Label>
              <div className="mt-1 flex items-center gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 border border-green-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/60 hover:bg-green-50/30">
                    <Upload className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="truncate">{uploading ? "Uploading…" : form.fileName || "Choose file…"}</span>
                  </div>
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, "form")} disabled={uploading} />
                </label>
                {form.fileUrl && (
                  <Button size="icon" variant="ghost" onClick={() => setForm((p) => ({ ...p, fileUrl: "", fileName: "", fileSize: 0 }))}
                    className="h-8 w-8 text-slate-400"><X className="h-4 w-4" /></Button>
                )}
              </div>
              {(form.fileSize ?? 0) > 0 && <p className="text-xs text-slate-400 mt-1">{formatFileSize(form.fileSize ?? 0)}</p>}
            </div>
            {!editingDoc && (
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium">Attach Supporting Files</Label>
                <p className="text-xs text-slate-400 mb-1">PDFs, Word, Excel, images, ZIPs — select multiple files at once.</p>
                <label className="cursor-pointer block">
                  <div className="flex items-center justify-center gap-2 border-2 border-dashed border-green-200 dark:border-slate-700 rounded-lg px-3 py-4 text-sm text-slate-500 dark:text-slate-400 hover:bg-green-50/30 dark:hover:bg-slate-800/40 transition-colors">
                    <Paperclip className="h-4 w-4 text-green-600" />
                    {uploading ? "Uploading…" : "Click to add supporting files"}
                  </div>
                  <input type="file" multiple className="hidden" disabled={uploading}
                    onChange={(e) => handleMultiUpload(e, (files) => setPendingFiles((p) => [...p, ...files]))} />
                </label>
                {pendingFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pendingFiles.map((f, i) => (
                      <div key={`${f.fileUrl}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-green-100 dark:border-slate-800 px-3 py-1.5 bg-green-50/30 dark:bg-slate-800/30">
                        <div className="flex items-center gap-2 min-w-0">
                          {fileIcon(f.mimeType, f.fileName)}
                          <span className="text-sm truncate text-slate-700 dark:text-slate-300">{f.fileName}</span>
                          <span className="text-xs text-slate-400 shrink-0">{formatFileSize(f.fileSize)}</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 shrink-0"
                          onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description…" rows={2} className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Internal notes…" rows={2} className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} className="dark:border-slate-700">Cancel</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploading}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 text-white">
              {(createMut.isPending || updateMut.isPending) ? "Saving…" : editingDoc ? "Update" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachments Dialog */}
      <Dialog open={!!attachmentsDoc} onOpenChange={(o) => !o && setAttachmentsDoc(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
              <Paperclip className="h-5 w-5" /> Attachments
            </DialogTitle>
            <DialogDescription className="truncate">{attachmentsDoc?.title}</DialogDescription>
          </DialogHeader>
          {canEdit && (
            <label className="cursor-pointer block">
              <div className="flex items-center justify-center gap-2 border-2 border-dashed border-green-200 dark:border-slate-700 rounded-lg px-3 py-4 text-sm text-slate-500 dark:text-slate-400 hover:bg-green-50/30 dark:hover:bg-slate-800/40 transition-colors">
                <Plus className="h-4 w-4 text-green-600" />
                {uploading || addAttMut.isPending ? "Uploading…" : "Add files (multiple allowed)"}
              </div>
              <input type="file" multiple className="hidden" disabled={uploading || addAttMut.isPending}
                onChange={(e) => handleMultiUpload(e, async (files) => {
                  for (const f of files) await addAttMut.mutateAsync(f);
                  toast({ title: `${files.length} attachment${files.length > 1 ? "s" : ""} added` });
                  void refetch();
                })} />
            </label>
          )}
          <div className="space-y-2">
            {attachmentsLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              : !attachments?.length
              ? <p className="text-sm text-slate-400 py-6 text-center">No attachments yet.</p>
              : attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between gap-2 p-3 border border-green-50 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3 min-w-0">
                      {fileIcon(att.mimeType, att.fileName)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{att.fileName}</p>
                        <p className="text-xs text-slate-400">
                          {formatFileSize(att.fileSize)} · {att.uploadedBy || "—"} · {format(new Date(att.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-700 dark:text-green-400"
                        title="Preview"
                        onClick={() => openView({ id: attachmentsDoc?.id, title: att.fileName, fileUrl: att.fileUrl, fileName: att.fileName, mimeType: att.mimeType })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 dark:text-blue-400"
                        title="Download"
                        onClick={() => downloadFile(att.fileUrl, att.fileName, attachmentsDoc?.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500"
                          title="Remove" disabled={delAttMut.isPending}
                          onClick={async () => {
                            try {
                              await delAttMut.mutateAsync(att.id);
                              toast({ title: "Attachment removed" });
                              void refetch();
                            } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
                          }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100 truncate pr-8">{previewDoc?.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-3 truncate">
              <span className="truncate">{previewDoc?.fileName}</span>
              {previewDoc && (
                <Button size="sm" variant="outline" className="gap-1 h-7 dark:border-slate-700 shrink-0"
                  onClick={() => window.open(previewDoc.fileUrl, "_blank")}>
                  <ExternalLink className="h-3 w-3" /> Open in tab
                </Button>
              )}
            </DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <div className="flex-1 min-h-[60vh] overflow-auto rounded-lg border border-green-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              {isImageFile(previewDoc.mimeType, previewDoc.fileName) ? (
                <img src={previewDoc.fileUrl} alt={previewDoc.title} className="max-w-full mx-auto" />
              ) : (
                <iframe src={previewDoc.fileUrl} title={previewDoc.title} className="w-full h-[72vh]" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog open={!!activityDoc} onOpenChange={(o) => !o && setActivityDoc(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
              <ScrollText className="h-5 w-5" /> Audit Log
            </DialogTitle>
            <DialogDescription className="truncate">
              {activityDoc?.title} · {activityDoc?.downloadCount ?? 0} download{(activityDoc?.downloadCount ?? 0) !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activityLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              : !activity?.length
              ? <p className="text-sm text-slate-400 py-6 text-center">No activity recorded yet.</p>
              : activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 p-3 border border-green-50 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-medium">{a.userName || "Unknown"}</span>{" "}
                        <span className="text-slate-500 dark:text-slate-400">{(ACTION_LABELS[a.action] ?? a.action).toLowerCase()}</span>
                        {a.details && <span className="text-slate-400"> — {a.details}</span>}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 shrink-0">{format(new Date(a.createdAt), "dd MMM yyyy HH:mm")}</p>
                  </div>
                ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={!!versionDocId} onOpenChange={(o) => !o && setVersionDocId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
              <History className="h-5 w-5" /> Version History
            </DialogTitle>
            <DialogDescription>Upload history and previous versions.</DialogDescription>
          </DialogHeader>
          {canEdit && (
            <div className="border border-green-100 dark:border-slate-800 rounded-xl p-4 bg-green-50/30 dark:bg-slate-800/30 space-y-3">
              <p className="text-sm font-semibold text-green-900 dark:text-green-300">Upload New Version</p>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 border border-green-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/60 hover:bg-green-50/30">
                    <Upload className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="truncate">{uploading ? "Uploading…" : newVer.fileName || "Choose file…"}</span>
                  </div>
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, "ver")} disabled={uploading} />
                </label>
              </div>
              <Input placeholder="Notes about this version…" value={newVer.notes}
                onChange={(e) => setNewVer((p) => ({ ...p, notes: e.target.value }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
              <Button size="sm" disabled={!newVer.fileUrl || addVerMut.isPending}
                onClick={async () => {
                  try {
                    await addVerMut.mutateAsync(newVer);
                    toast({ title: "New version uploaded" });
                    setNewVer({ fileUrl: "", fileName: "", fileSize: 0, notes: "" });
                    void refetch();
                  } catch { toast({ title: "Failed", variant: "destructive" }); }
                }}
                className="bg-green-800 hover:bg-green-900 text-white">
                <Plus className="h-4 w-4 mr-1" /> Save Version
              </Button>
            </div>
          )}
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium text-green-900 dark:text-green-300">Upload History</p>
            {versionsLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              : !versions?.length
              ? <p className="text-sm text-slate-400 py-4 text-center">No previous versions recorded.</p>
              : versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 border border-green-50 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-300">
                        v{v.version}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{v.fileName || "—"}</p>
                        <p className="text-xs text-slate-400">
                          {formatFileSize(v.fileSize)} · {v.uploadedBy || "Unknown"} · {format(new Date(v.createdAt), "dd MMM yyyy HH:mm")}
                        </p>
                        {v.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">{v.notes}</p>}
                      </div>
                    </div>
                    {v.fileUrl && (
                      <Button size="sm" variant="ghost" onClick={() => window.open(v.fileUrl, "_blank")} className="text-slate-500">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
            }
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(o) => !o && setDeleteDocId(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the document, all its attachments, version history and audit trail.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!deleteDocId) return;
                try {
                  await deleteMut.mutateAsync(deleteDocId);
                  toast({ title: "Document deleted" });
                  setDeleteDocId(null);
                  void refetch();
                } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
              }}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
