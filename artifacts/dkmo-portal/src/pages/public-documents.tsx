import { useState } from "react";
import { format } from "date-fns";
import {
  FolderOpen, Search, Download, Eye, FileText, FileImage, File, Globe, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  usePublicDocuments, trackPublicDocument, type PublicDocument,
} from "@workspace/api-client-react";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(mime: string, name: string) {
  return mime.includes("pdf") || name.toLowerCase().endsWith(".pdf");
}
function isImage(mime: string, name: string) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
}

function fileIcon(mime: string, name: string) {
  if (isImage(mime, name)) return <FileImage className="h-5 w-5 text-blue-500 shrink-0" />;
  if (isPdf(mime, name)) return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
  return <File className="h-5 w-5 text-slate-500 shrink-0" />;
}

export default function PublicDocumentsPage() {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<PublicDocument | null>(null);
  const { data, isLoading } = usePublicDocuments(search || undefined);
  const docs = data?.items ?? [];
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const download = (doc: PublicDocument) => {
    trackPublicDocument(doc.id, "downloaded");
    const a = document.createElement("a");
    a.href = doc.fileUrl;
    a.download = doc.fileName || doc.title;
    a.click();
  };

  const openPreview = (doc: PublicDocument) => {
    trackPublicDocument(doc.id, "viewed");
    if (isPdf(doc.mimeType, doc.fileName) || isImage(doc.mimeType, doc.fileName)) {
      setPreview(doc);
    } else {
      window.open(doc.fileUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-green-100 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={`${basePath}/logo-circle.png`} alt="DKMO" className="h-10 w-10 rounded-full" />
          <div>
            <h1 className="text-lg font-bold text-green-950 dark:text-green-100 leading-tight">DKMO Document Portal</h1>
            <p className="text-xs text-green-800/70 dark:text-slate-400 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Public documents — no login required
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60" />
          <Input
            placeholder="Search public documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"
            data-testid="input-public-doc-search"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No public documents available</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Documents published by DKMO will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {docs.map((doc) => (
              <Card key={doc.id} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {fileIcon(doc.mimeType, doc.fileName)}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-green-950 dark:text-slate-100 truncate">{doc.title}</p>
                      {doc.description && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{doc.description}</p>}
                      <p className="text-xs text-slate-400 mt-1">
                        {doc.fileName || "—"} · {formatFileSize(doc.fileSize)} · {format(new Date(doc.createdAt), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.split(",").filter(Boolean).slice(0, 3).map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{t.trim()}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {doc.fileUrl && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openPreview(doc)} className="gap-1 dark:border-slate-700" data-testid={`button-public-view-${doc.id}`}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <Button size="sm" onClick={() => download(doc)} className="gap-1 bg-green-800 hover:bg-green-900 dark:bg-green-700 text-white" data-testid={`button-public-download-${doc.id}`}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Inline preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100 truncate pr-8">{preview?.title}</DialogTitle>
            <DialogDescription className="truncate">{preview?.fileName}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex-1 min-h-[60vh] overflow-auto rounded-lg border border-green-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              {isImage(preview.mimeType, preview.fileName) ? (
                <img src={preview.fileUrl} alt={preview.title} className="max-w-full mx-auto" />
              ) : (
                <iframe src={preview.fileUrl} title={preview.title} className="w-full h-[70vh]" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
