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
import { PaymentInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { getCurrentMonth } from "@/lib/utils";
import { useEffect } from "react";
import { useListMembers } from "@workspace/api-client-react";

const formSchema = z.object({
  memberId: z.string().min(1, "Member is required"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format must be YYYY-MM"),
  amountPaid: z.coerce.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "upi", "bank_transfer", "card", "cheque", "other"]),
  receiptNumber: z.string().min(1, "Receipt number is required"),
  notes: z.string().optional(),
});

interface PaymentFormProps {
  defaultValues?: Partial<PaymentInput>;
  fixedMemberId?: string;
  onSubmit: (data: PaymentInput) => void;
  isSubmitting?: boolean;
}

export function PaymentForm({ defaultValues, fixedMemberId, onSubmit, isSubmitting }: PaymentFormProps) {
  const { data: members } = useListMembers();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberId: fixedMemberId || defaultValues?.memberId || "",
      month: defaultValues?.month || getCurrentMonth(),
      amountPaid: defaultValues?.amountPaid || 0,
      paymentMethod: defaultValues?.paymentMethod || "cash",
      receiptNumber: defaultValues?.receiptNumber || `RCPT-${Date.now()}`,
      notes: defaultValues?.notes || "",
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        memberId: fixedMemberId || defaultValues.memberId || "",
        month: defaultValues.month || getCurrentMonth(),
        amountPaid: defaultValues.amountPaid || 0,
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
            name="month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month (YYYY-MM)</FormLabel>
                <FormControl>
                  <Input placeholder="2023-10" {...field} />
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
                <FormLabel>Amount Paid (SAR )</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="500" {...field} />
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
