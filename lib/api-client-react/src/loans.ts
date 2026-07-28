import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type LoanType =
  | "personal"
  | "medical"
  | "education"
  | "business"
  | "emergency"
  | "marriage"
  | "housing"
  | "other";
export type LoanStatus = "active" | "closed" | "overdue" | "defaulted";
export type LoanPaymentMethod = "cash" | "bank_transfer" | "upi" | "card" | "cheque";

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
  totalPaid: number;
  outstandingBalance: number;
  status: LoanStatus;
  convenorName: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: LoanPaymentMethod;
  notes: string;
  recordedBy: string;
  createdAt: string;
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
  dueThisMonthAmount: number;
  dueThisMonthCount: number;
  membersWithMissedPayments: number;
}

/** Simplified create payload — everything else is calculated automatically. */
export interface LoanCreateInput {
  memberId: string;
  loanType: LoanType;
  principalAmount: number;
  emiAmount: number;
  disbursedDate: string;
  convenorName?: string;
  notes?: string;
}

export interface LoanUpdateInput {
  memberId?: string | null;
  loanType?: LoanType;
  principalAmount?: number;
  disbursedDate?: string | null;
  emiAmount?: number;
  convenorName?: string;
  description?: string;
  notes?: string;
}

export interface LoanPaymentInput {
  amount: number;
  paymentDate: string;
  paymentMethod: LoanPaymentMethod;
  notes?: string;
}

export interface RecordLoanPaymentResponse {
  payment: LoanPayment;
  loanClosed: boolean;
}

/** Extra list filters powering the stat-card drilldowns. */
export type LoanListStatusFilter = LoanStatus | "open" | "due_this_month";

export interface ListLoansParams {
  search?: string;
  status?: LoanListStatusFilter;
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

export function useListLoanPayments(loanId: string) {
  return useQuery<LoanPayment[]>({
    queryKey: ["loans", loanId, "payments"],
    queryFn: () => customFetch<LoanPayment[]>(`/api/loans/${loanId}/payments`),
    enabled: Boolean(loanId),
  });
}

export function useRecordLoanPayment(loanId: string) {
  const qc = useQueryClient();
  return useMutation<RecordLoanPaymentResponse, Error, LoanPaymentInput>({
    mutationFn: (body) =>
      customFetch<RecordLoanPaymentResponse>(`/api/loans/${loanId}/payments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useDeleteLoanPayment(loanId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (paymentId) =>
      customFetch<void>(`/api/loans/${loanId}/payments/${paymentId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation<Loan, Error, LoanCreateInput>({
    mutationFn: (body) =>
      customFetch<Loan>("/api/loans", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useUpdateLoan(id: string) {
  const qc = useQueryClient();
  return useMutation<Loan, Error, LoanUpdateInput>({
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
