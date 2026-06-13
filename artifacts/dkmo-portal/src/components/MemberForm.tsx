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
import { MemberInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useEffect } from "react";

const DESIGNATION_OPTIONS = [
  "",
  "President",
  "Vice President",
  "General Secretary",
  "Joint Secretary",
  "Treasurer",
  "Overseas Convenor",
  "Advisor",
  "Loan Convenor",
  "Loan Convenor (Recovery)",
  "Auditor",
  "Verification Team Leader",
  "Event organizer",
  "Employment Scheme",
  "FRF Convenor",
  "Executive Member",
  "Member",
];

const formSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  mobileNumber: z.string().min(1, "Mobile number is required"),
  membershipId: z.string().min(1, "Membership ID is required"),
  city: z.string().optional(),
  country: z.string().optional(),
  designation: z.string().optional(),
  monthlyAmount: z.coerce.number().min(0, "Amount must be positive"),
});

interface MemberFormProps {
  defaultValues?: Partial<MemberInput>;
  onSubmit: (data: MemberInput) => void;
  isSubmitting?: boolean;
}

export function MemberForm({ defaultValues, onSubmit, isSubmitting }: MemberFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: defaultValues?.fullName || "",
      mobileNumber: defaultValues?.mobileNumber || "",
      membershipId: defaultValues?.membershipId || "",
      city: defaultValues?.city || "",
      country: defaultValues?.country || "",
      designation: (defaultValues as any)?.designation || "",
      monthlyAmount: defaultValues?.monthlyAmount || 0,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        fullName: defaultValues.fullName || "",
        mobileNumber: defaultValues.mobileNumber || "",
        membershipId: defaultValues.membershipId || "",
        city: defaultValues.city || "",
        country: defaultValues.country || "",
        designation: (defaultValues as any).designation || "",
        monthlyAmount: defaultValues.monthlyAmount || 0,
      });
    }
  }, [defaultValues, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="mobileNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mobile Number</FormLabel>
                <FormControl>
                  <Input placeholder="+91 9876543210" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="membershipId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Membership ID</FormLabel>
                <FormControl>
                  <Input placeholder="DKMO-1001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input placeholder="Mangaluru" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input placeholder="India" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="designation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Designation / Post</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="w-full border border-input rounded-md px-3 h-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {DESIGNATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "" ? "— None —" : opt}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="monthlyAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly Contribution Amount (SAR )</FormLabel>
              <FormControl>
                <Input type="number" placeholder="500" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Member"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
