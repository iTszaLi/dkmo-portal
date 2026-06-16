import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type DocumentStatus = "active" | "expired" | "archived";
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
  createdAt: string;
  updatedAt: string;
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
}

export interface ListDocumentsParams {
  search?: string;
  category?: string;
  status?: string;
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
