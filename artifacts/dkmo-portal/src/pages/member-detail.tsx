import { useParams, Link } from "wouter";
import {
  useGetMember,
  useUpdateMemberFeeStatus,
  getGetMemberQueryKey,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import type { FeeStatusInputFeeStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatSAR, formatDate, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UserCircle, MapPin, Phone, CalendarDays, CheckCircle2, Clock, XCircle, Users, HeartHandshake } from "lucide-react";

export default function MemberDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: member, isLoading: isMemberLoading } = useGetMember(id || "", {
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id || "") },
  });

  const updateFeeStatus = useUpdateMemberFeeStatus();

  const handleFeeStatus = (feeStatus: FeeStatusInputFeeStatus) => {
    if (!id) return;
    updateFeeStatus.mutate({ id, data: { feeStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        toast({ title: "Fee status updated" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update fee status", description: err.message, variant: "destructive" });
      },
    });
  };

  if (isMemberLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-1" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">Member not found</h2>
        <Link href="/members" className="text-emerald-600 hover:underline mt-4 inline-block">
          Back to Members
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/members">
            <Button variant="outline" size="icon" className="h-9 w-9 border-emerald-200 dark:border-slate-700">
              <ArrowLeft className="h-4 w-4 text-emerald-700 dark:text-slate-300" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Member Details</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                <UserCircle className="h-12 w-12" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-950 dark:text-slate-100">{member.fullName}</h2>
                <p className="text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 inline-block px-2 py-1 rounded-md mt-1">
                  ID: {member.membershipId}
                </p>
                {member.designation ? (
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-800 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 inline-block px-3 py-1 rounded-full">
                    {member.designation}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 dark:text-slate-500 text-xs font-medium">Mobile</p>
                  <p className="text-emerald-900 dark:text-slate-200 font-medium">{member.mobileNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 dark:text-slate-500 text-xs font-medium">Location</p>
                  <p className="text-emerald-900 dark:text-slate-200 font-medium">{member.city}, {member.country}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 dark:text-slate-500 text-xs font-medium">Joined</p>
                  <p className="text-emerald-900 dark:text-slate-200 font-medium">{formatDate(member.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-emerald-100 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-900 dark:text-slate-200">Reference Member</span>
              </div>
              {member.refMemberName ? (
                <div className="text-sm">
                  <p className="text-emerald-900 dark:text-slate-200 font-medium">{member.refMemberName}</p>
                  {member.refMemberId ? (
                    <p className="text-emerald-600 dark:text-slate-500 text-xs mt-0.5">ID: {member.refMemberId}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-emerald-500/70 dark:text-slate-600">No reference member recorded.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-emerald-900 dark:text-slate-100">Membership Fee</CardTitle>
              <CardDescription className="dark:text-slate-400">One-time registration fee for this member.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                  <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Fee Amount</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-green-300">{formatSAR(member.membershipFee)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                  <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Status</p>
                  <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus)}`}>
                    {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "pending" ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {feeStatusLabel(member.feeStatus)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Paid On</p>
                  <p className="mt-1 text-emerald-900 dark:text-slate-200 font-medium">
                    {member.feePaidAt ? formatDate(member.feePaidAt) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Updated By</p>
                  <p className="mt-1 text-emerald-900 dark:text-slate-200 font-medium">{member.feeUpdatedBy || "—"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-100 dark:border-slate-800">
                <Button
                  size="sm"
                  variant={member.feeStatus === "paid" ? "default" : "outline"}
                  disabled={member.feeStatus === "paid" || updateFeeStatus.isPending}
                  onClick={() => handleFeeStatus("paid")}
                  className={member.feeStatus === "paid" ? "bg-emerald-700 hover:bg-emerald-800" : "border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400"}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Paid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={member.feeStatus === "pending" || updateFeeStatus.isPending}
                  onClick={() => handleFeeStatus("pending")}
                  className="border-amber-200 text-amber-700 dark:border-slate-700 dark:text-amber-400"
                >
                  <Clock className="mr-2 h-4 w-4" /> Mark Pending
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={member.feeStatus === "unpaid" || updateFeeStatus.isPending}
                  onClick={() => handleFeeStatus("unpaid")}
                  className="border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                >
                  <XCircle className="mr-2 h-4 w-4" /> Mark Unpaid
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                <HeartHandshake className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> FRF Contributions
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Every DKMO member is automatically eligible for the Family Relief Fund.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 bg-emerald-50/30 dark:bg-slate-800/40 rounded-lg border border-emerald-100 dark:border-slate-800 border-dashed">
                <HeartHandshake className="h-10 w-10 text-emerald-200 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-emerald-700 dark:text-slate-400">
                  FRF contribution cycles will appear here once configured.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
