import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type DocumentStatus = "active" | "expired" | "archived";
export type DocumentVisibility = "public" | "members" | "committee" | "admin";
export type DocumentCategory =
  | "general"
  | "member_docs"
  | "frf_docs"
  | "loan_docs"
  | "committee_docs"
  | "financial"
  | "legal"
  | "minutes"
  | "other";

export interface DocumentRecord {
  id: string;
  title: string;
  description: string;
  category: DocumentCategory;
  tags: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  expiryDate: string | null;
  status: DocumentStatus;
  version: number;
  linkedEntityId: string;
  linkedEntityType: string;
  notes: string;
  visibility: DocumentVisibility;
  downloadCount: number;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAttachment {
  id: string;
  documentId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface DocumentActivityEntry {
  id: string;
  documentId: string;
  action: string;
  userName: string;
  details: string;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  notes: string;
  createdAt: string;
}

export interface DocumentListResponse {
  items: DocumentRecord[];
  total: number;
}

export interface DocumentInput {
  title: string;
  description?: string;
  category?: DocumentCategory;
  tags?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  expiryDate?: string | null;
  status?: DocumentStatus;
  linkedEntityId?: string;
  linkedEntityType?: string;
  notes?: string;
  visibility?: DocumentVisibility;
}

export interface ListDocumentsParams {
  search?: string;
  category?: string;
  status?: string;
  visibility?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function useListDocuments(params: ListDocumentsParams = {}) {
  return useQuery<DocumentListResponse>({
    queryKey: ["documents", params],
    queryFn: () =>
      customFetch<DocumentListResponse>(
        `/api/documents${buildQuery(params as Record<string, unknown>)}`,
      ),
  });
}

export function useGetDocument(id: string) {
  return useQuery<DocumentRecord>({
    queryKey: ["documents", id],
    queryFn: () => customFetch<DocumentRecord>(`/api/documents/${id}`),
    enabled: Boolean(id),
  });
}

export function useListDocumentVersions(documentId: string) {
  return useQuery<DocumentVersion[]>({
    queryKey: ["documents", documentId, "versions"],
    queryFn: () =>
      customFetch<DocumentVersion[]>(`/api/documents/${documentId}/versions`),
    enabled: Boolean(documentId),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation<DocumentRecord, Error, DocumentInput>({
    mutationFn: (body) =>
      customFetch<DocumentRecord>("/api/documents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation<DocumentRecord, Error, Partial<DocumentInput>>({
    mutationFn: (body) =>
      customFetch<DocumentRecord>(`/api/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      customFetch<void>(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export interface AddVersionInput {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  notes?: string;
}

export function useAddDocumentVersion(documentId: string) {
  const qc = useQueryClient();
  return useMutation<DocumentVersion, Error, AddVersionInput>({
    mutationFn: (body) =>
      customFetch<DocumentVersion>(`/api/documents/${documentId}/versions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── Attachments ──────────────────────────────────────────────────────────────

export function useListDocumentAttachments(documentId: string) {
  return useQuery<DocumentAttachment[]>({
    queryKey: ["documents", documentId, "attachments"],
    queryFn: () =>
      customFetch<DocumentAttachment[]>(`/api/documents/${documentId}/attachments`),
    enabled: Boolean(documentId),
  });
}

export interface AttachmentInput {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}

export function useAddDocumentAttachment(documentId: string) {
  const qc = useQueryClient();
  return useMutation<DocumentAttachment, Error, AttachmentInput>({
    mutationFn: (body) =>
      customFetch<DocumentAttachment>(`/api/documents/${documentId}/attachments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useDeleteDocumentAttachment(documentId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (attachmentId) =>
      customFetch<void>(`/api/documents/${documentId}/attachments/${attachmentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── Activity log & tracking ──────────────────────────────────────────────────

export function useDocumentActivity(documentId: string) {
  return useQuery<DocumentActivityEntry[]>({
    queryKey: ["documents", documentId, "activity"],
    queryFn: () =>
      customFetch<DocumentActivityEntry[]>(`/api/documents/${documentId}/activity`),
    enabled: Boolean(documentId),
  });
}

/** Fire-and-forget view/download tracking. */
export function trackDocument(documentId: string, action: "viewed" | "downloaded", fileName = "") {
  void customFetch<void>(`/api/documents/${documentId}/track`, {
    method: "POST",
    body: JSON.stringify({ action, fileName }),
  }).catch(() => {});
}

// ── Public portal (no auth) ──────────────────────────────────────────────────

export interface PublicDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export function usePublicDocuments(search?: string) {
  return useQuery<{ items: PublicDocument[] }>({
    queryKey: ["public-documents", search ?? ""],
    queryFn: () =>
      customFetch<{ items: PublicDocument[] }>(
        `/api/public/documents${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

export function trackPublicDocument(documentId: string, action: "viewed" | "downloaded") {
  void customFetch<void>(`/api/public/documents/${documentId}/track`, {
    method: "POST",
    body: JSON.stringify({ action }),
  }).catch(() => {});
}
