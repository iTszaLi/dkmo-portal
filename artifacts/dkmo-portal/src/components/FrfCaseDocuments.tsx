import { useMemo, useState } from "react";
import {
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, FolderOpen, Paperclip, ExternalLink, Download, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CASE_DOC_LABELS = [
  "Hospital Documents",
  "Death Certificate",
  "Bills",
  "Supporting Document",
  "Other",
] as const;

/** Documents attached to an FRF case (admin only manages; everyone with access can view). */
export function FrfCaseDocuments({ claimId, isAdmin }: { claimId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useListDocuments({
    linkedEntityType: "frf_claim",
    linkedEntityId: claimId,
    pageSize: 100,
  });
  const docs = useMemo(() => data?.items ?? [], [data]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState<string>(CASE_DOC_LABELS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [file, setFile] = useState<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const res = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: f.name, size: f.size, contentType: f.type }) },
      );
      const put = await fetch(res.uploadURL, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
      if (!put.ok) throw new Error(`Upload failed with status ${put.status}`);
      setFile({ fileUrl: `/api/storage/public-objects/${res.objectPath}`, fileName: f.name, fileSize: f.size, mimeType: f.type });
      toast({ title: "File uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    const title = (label === "Other" ? customLabel : label).trim();
    if (!title) { toast({ title: "Document label is required", variant: "destructive" }); return; }
    if (!file) { toast({ title: "Please choose a file first", variant: "destructive" }); return; }
    try {
      await createDocument.mutateAsync({
        title,
        category: "frf_docs",
        status: "active",
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        linkedEntityType: "frf_claim",
        linkedEntityId: claimId,
      } as any);
      toast({ title: "Document attached" });
      setDialogOpen(false);
      setFile(null);
      setCustomLabel("");
      setLabel(CASE_DOC_LABELS[0]);
      void refetch();
    } catch (err) {
      toast({ title: "Failed to attach document", description: String(err), variant: "destructive" });
    }
  }

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-green-600" /> Case Documents
          </CardTitle>
          <CardDescription className="dark:text-slate-400">Hospital documents, death certificate, bills, and other supporting files</CardDescription>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" className="dark:border-slate-700" onClick={() => setDialogOpen(true)}>
            <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Attach
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 bg-green-50/30 dark:bg-slate-800/40 rounded-lg border border-green-100 dark:border-slate-800 border-dashed">
            <FileText className="h-10 w-10 text-green-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-green-700 dark:text-slate-400">No documents attached to this case yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/30 dark:bg-slate-800/40 p-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-green-950 dark:text-slate-100 text-sm truncate">{d.title}</p>
                    <p className="text-[11px] text-green-600/70 dark:text-slate-500 truncate">{d.fileName || "Attached file"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {d.fileUrl && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-700 dark:text-green-400" onClick={() => window.open(d.fileUrl, "_blank")} title="Open">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-700 dark:text-green-400" title="Download"
                        onClick={() => { const a = document.createElement("a"); a.href = d.fileUrl; a.download = d.fileName || d.title; a.click(); }}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 dark:text-red-400" title="Remove"
                      disabled={deleteDocument.isPending}
                      onClick={() => deleteDocument.mutate(d.id, {
                        onSuccess: () => { void refetch(); toast({ title: "Document removed" }); },
                        onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
                      })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Attach Case Document</DialogTitle>
            <DialogDescription className="dark:text-slate-400">Upload a document for this FRF case.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Document Type</Label>
              <Select value={label} onValueChange={setLabel}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  {CASE_DOC_LABELS.map((l) => <SelectItem key={l} value={l} className="dark:text-slate-300">{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {label === "Other" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Document label" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">File</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="dark:border-slate-700" disabled={uploading}
                  onClick={() => document.getElementById("frf-case-doc-file")?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> {uploading ? "Uploading…" : file ? "Replace File" : "Choose File"}
                </Button>
                {file && <span className="text-xs text-green-700 dark:text-green-400 truncate">{file.fileName}</span>}
              </div>
              <input id="frf-case-doc-file" type="file" className="hidden" onChange={onFileChange} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:border-slate-700">Cancel</Button>
            <Button onClick={onSave} disabled={createDocument.isPending || uploading} className="bg-green-700 hover:bg-green-800 text-white">
              {createDocument.isPending ? "Saving…" : "Attach Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
