import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface LoanBudget {
  totalBudget: number;
  totalDisbursed: number;
  remainingBudget: number;
  activeLoans: number;
  pendingApplications: number;
  updatedAt: string | null;
}

export function useGetLoanBudget() {
  return useQuery({
    queryKey: ["loan-budget"],
    queryFn: () => customFetch<LoanBudget>("/api/loans/budget"),
  });
}

export function useUpdateLoanBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number }) => 
      customFetch<LoanBudget>("/api/loans/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan-budget"] });
    },
  });
}

export interface CommitteeTerm {
  id: string;
  committeeYear: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  memberCount: number;
}

export interface CommitteeMemberAssignment {
  assignmentId: string;
  memberId: string;
  membershipId: string;
  legacyMemberId: string | null;
  fullName: string;
  photoUrl: string | null;
  position: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  permissions: string[];
}

export interface CommitteeTermDetail {
  id: string;
  committeeYear: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  members: CommitteeMemberAssignment[];
}

export function useGetActiveCommitteeTerm() {
  return useQuery({
    queryKey: ["committee-terms"],
    queryFn: () => customFetch<CommitteeTerm[]>("/api/committee/terms"),
    select: (terms) => terms.find((t) => t.isActive) || null,
  });
}

export function useGetCommitteeTermDetail(year: string | undefined) {
  return useQuery({
    queryKey: ["committee-terms", year],
    queryFn: () => customFetch<CommitteeTermDetail>(`/api/committee/terms/${year}`),
    enabled: !!year,
  });
}
