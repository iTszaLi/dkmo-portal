import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetMember, 
  useListPayments, 
  useCreatePayment,
  getGetMemberQueryKey,
  getListPaymentsQueryKey
} from "@workspace/api-client-react";
import { PaymentInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PaymentForm } from "@/components/PaymentForm";
import { formatSAR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, UserCircle, MapPin, Phone, CreditCard, CalendarDays, ReceiptText } from "lucide-react";

export default function MemberDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const { data: member, isLoading: isMemberLoading } = useGetMember(id || "", { 
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id || "") } 
  });

  const { data: payments, isLoading: isPaymentsLoading } = useListPayments(
    { memberId: id }, 
    { query: { enabled: !!id, queryKey: getListPaymentsQueryKey({ memberId: id }) } }
  );

  const createPayment = useCreatePayment();

  const handleRecordPayment = (data: PaymentInput) => {
    createPayment.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id || "") });
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ memberId: id }) });
        setIsPaymentOpen(false);
        toast({ title: "Payment recorded successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
      }
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
        <h2 className="text-2xl font-bold text-emerald-900">Member not found</h2>
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
            <Button variant="outline" size="icon" className="h-9 w-9 border-emerald-200">
              <ArrowLeft className="h-4 w-4 text-emerald-700" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-emerald-950">Member Details</h1>
        </div>
        
        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-700 hover:bg-emerald-800">
              <CreditCard className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Record Payment for {member.fullName}</DialogTitle>
            </DialogHeader>
            <PaymentForm 
              fixedMemberId={member.id} 
              onSubmit={handleRecordPayment} 
              isSubmitting={createPayment.isPending} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 rounded-2xl border-emerald-100 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <UserCircle className="h-12 w-12" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-950">{member.fullName}</h2>
                <p className="text-sm font-medium text-emerald-600 bg-emerald-50 inline-block px-2 py-1 rounded-md mt-1">
                  ID: {member.membershipId}
                </p>
                {(member as any).designation ? (
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-800 bg-amber-100 inline-block px-3 py-1 rounded-full">
                    {(member as any).designation}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 text-xs font-medium">Mobile</p>
                  <p className="text-emerald-900 font-medium">{member.mobileNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 text-xs font-medium">Location</p>
                  <p className="text-emerald-900 font-medium">{member.city}, {member.country}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-emerald-500 text-xs font-medium">Joined</p>
                  <p className="text-emerald-900 font-medium">{formatDate(member.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-emerald-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-emerald-600">Monthly Dues</span>
                <span className="text-sm font-bold text-emerald-900">{formatSAR(member.monthlyAmount)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-emerald-600">Total Paid</span>
                <span className="text-sm font-bold text-emerald-700">{formatSAR(member.totalPaid)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-red-500">Total Due</span>
                <span className="text-sm font-bold text-red-600">{formatSAR(member.totalDue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 rounded-2xl border-emerald-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-emerald-900">Payment History</CardTitle>
            <CardDescription>A complete record of payments made by this member.</CardDescription>
          </CardHeader>
          <CardContent>
            {isPaymentsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : payments?.length === 0 ? (
              <div className="text-center py-12 bg-emerald-50/30 rounded-lg border border-emerald-100 border-dashed">
                <ReceiptText className="h-12 w-12 text-emerald-200 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-emerald-900">No payments yet</h3>
                <p className="text-sm text-emerald-600 mt-1">This member hasn't made any payments.</p>
                <Button 
                  variant="outline" 
                  className="mt-4 border-emerald-200 text-emerald-700"
                  onClick={() => setIsPaymentOpen(true)}
                >
                  Record First Payment
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-100 overflow-hidden">
                <Table>
                  <TableHeader className="bg-emerald-50">
                    <TableRow>
                      <TableHead className="font-medium text-emerald-900">Month</TableHead>
                      <TableHead className="font-medium text-emerald-900">Receipt</TableHead>
                      <TableHead className="font-medium text-emerald-900">Date Paid</TableHead>
                      <TableHead className="font-medium text-emerald-900">Method</TableHead>
                      <TableHead className="text-right font-medium text-emerald-900">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments?.map((payment) => (
                      <TableRow key={payment.id} className="hover:bg-emerald-50/50">
                        <TableCell className="font-medium text-emerald-950">{payment.month}</TableCell>
                        <TableCell className="text-emerald-700">{payment.receiptNumber}</TableCell>
                        <TableCell className="text-emerald-700">{formatDate(payment.paidAt)}</TableCell>
                        <TableCell className="text-emerald-700 capitalize">
                          {payment.paymentMethod.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-900">
                          {formatSAR(payment.amountPaid)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
