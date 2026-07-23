import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PaymentInput } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useListMembers, useListFrfClaims } from "@workspace/api-client-react";

const formSchema = z
  .object({
    memberId: z.string().min(1, "Member is required"),
    paymentType: z.enum(["membership_fee", "frf_contribution", "donation", "sponsorship", "waiver", "adjustment", "other"]),
    frfClaimId: z.string().optional(),
    amountDue: z.coerce.number().min(0),
    amountPaid: z.coerce.number().min(0),
    status: z.enum(["paid", "pending", "overdue", "cancelled", "refunded"]),
    paymentMethod: z.enum(["cash", "upi", "bank_transfer", "card", "cheque", "other"]),
    receiptNumber: z.string().min(1, "Receipt number is required"),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isSpecialType = data.paymentType === "waiver" || data.paymentType === "adjustment";
    const isNonCollecting = data.status === "cancelled" || data.status === "refunded";
    if (data.amountPaid <= 0 && !isSpecialType && !isNonCollecting) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountPaid"],
        message: "Amount must be greater than 0 (only Waiver/Adjustment or Cancelled/Refunded records may be 0)",
      });
    }
  });

interface PaymentFormProps {
  defaultValues?: Partial<PaymentInput>;
  fixedMemberId?: string;
  onSubmit: (data: PaymentInput) => void;
  isSubmitting?: boolean;
}

export function PaymentForm({ defaultValues, fixedMemberId, onSubmit, isSubmitting }: PaymentFormProps) {
  const { data: members } = useListMembers();
  const { data: approvedClaims } = useListFrfClaims({ status: "approved" });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberId: fixedMemberId || defaultValues?.memberId || "",
      paymentType: defaultValues?.paymentType || "membership_fee",
      frfClaimId: defaultValues?.frfClaimId || "",
      amountDue: defaultValues?.amountDue ?? 0,
      amountPaid: defaultValues?.amountPaid || 0,
      status: defaultValues?.status || "paid",
      paymentMethod: defaultValues?.paymentMethod || "cash",
      receiptNumber: defaultValues?.receiptNumber || `RCPT-${Date.now()}`,
      notes: defaultValues?.notes || "",
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        memberId: fixedMemberId || defaultValues.memberId || "",
        paymentType: defaultValues.paymentType || "membership_fee",
        frfClaimId: defaultValues.frfClaimId || "",
        amountDue: defaultValues.amountDue ?? 0,
        amountPaid: defaultValues.amountPaid || 0,
        status: defaultValues.status || "paid",
        paymentMethod: defaultValues.paymentMethod || "cash",
        receiptNumber: defaultValues.receiptNumber || `RCPT-${Date.now()}`,
        notes: defaultValues.notes || "",
      });
    }
  }, [defaultValues, fixedMemberId, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => onSubmit(d as PaymentInput))} className="space-y-4">
        {!fixedMemberId && (
          <FormField
            control={form.control}
            name="memberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Member</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {members?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.fullName} ({m.membershipId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="membership_fee">
                      Membership Fee (one-time SAR 100)
                    </SelectItem>
                    <SelectItem value="frf_contribution">
                      FRF Contribution (per approved claim)
                    </SelectItem>
                    <SelectItem value="donation">Donation</SelectItem>
                    <SelectItem value="sponsorship">Sponsorship</SelectItem>
                    <SelectItem value="waiver">Waiver (zero-amount allowed)</SelectItem>
                    <SelectItem value="adjustment">Adjustment (zero-amount allowed)</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {form.watch("paymentType") === "frf_contribution" && (
          <FormField
            control={form.control}
            name="frfClaimId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>FRF Claim</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    const claim = approvedClaims?.find((c) => c.id === v);
                    if (claim) {
                      form.setValue("amountDue", claim.contributionAmount);
                      form.setValue("amountPaid", claim.contributionAmount);
                    }
                  }}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select the approved claim this contribution is for" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {approvedClaims?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.claimantName} — {c.claimType.replace(/_/g, " ")} (SAR {c.contributionAmount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Linking the claim updates the member's FRF contribution ledger automatically.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amountDue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount Due (SAR)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amountPaid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount Paid (SAR)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="receiptNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Receipt Number</FormLabel>
                <FormControl>
                  <Input placeholder="RCPT-1234" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Any additional notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Recording..." : "Record Payment"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
