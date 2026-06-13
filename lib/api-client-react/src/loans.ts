import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type LoanType = "personal" | "emergency" | "education" | "medical" | "business";
export type LoanStatus = "active" | "closed" | "overdue" | "defaulted";

export interface Loan {
  id: string;
  memberId: string | null;
  memberName: string | null;
  membershipId: string | null;
  loanType: LoanType;
  principalAmount: number;
  disbursedDate: string | null;
  emiAmount: number;
  emiCount: number;
  paidEmis: number;
  outstandingBalance: number;
  status: LoanStatus;
  convenorName: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanListResponse {
  items: Loan[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LoanStats {
  total: number;
  active: number;
  overdue: number;
  closed: number;
  totalPrincipal: number;
  totalOutstanding: number;
}

export interface LoanInput {
  memberId?: string | null;
  loanType?: LoanType;
  principalAmount?: number;
  disbursedDate?: string | null;
  emiAmount?: number;
  emiCount?: number;
  paidEmis?: number;
  status?: LoanStatus;
  convenorName?: string;
  description?: string;
  notes?: string;
}

export interface ListLoansParams {
  search?: string;
  status?: LoanStatus;
  loanType?: LoanType;
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

export function useListLoans(params: ListLoansParams = {}) {
  return useQuery<LoanListResponse>({
    queryKey: ["loans", params],
    queryFn: () =>
      customFetch<LoanListResponse>(`/api/loans${buildQuery(params as Record<string, unknown>)}`),
  });
}

export function useGetLoan(id: string) {
  return useQuery<Loan>({
    queryKey: ["loans", id],
    queryFn: () => customFetch<Loan>(`/api/loans/${id}`),
    enabled: Boolean(id),
  });
}

export function useGetLoanStats() {
  return useQuery<LoanStats>({
    queryKey: ["loans", "stats"],
    queryFn: () => customFetch<LoanStats>("/api/loans/stats"),
  });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation<Loan, Error, LoanInput>({
    mutationFn: (body) =>
      customFetch<Loan>("/api/loans", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useUpdateLoan(id: string) {
  const qc = useQueryClient();
  return useMutation<Loan, Error, LoanInput>({
    mutationFn: (body) =>
      customFetch<Loan>(`/api/loans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => customFetch<void>(`/api/loans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}
