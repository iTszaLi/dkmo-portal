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
import { Label } from "@/components/ui/label";
import { MemberInput } from "@workspace/api-client-react";
import { MemberRefPicker, type MemberRefEntry } from "@/components/MemberRefPicker";
import { useEffect, useState } from "react";

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

const FEE_STATUS_OPTIONS = ["unpaid", "pending", "paid"] as const;

// Saudi mobile: optional +966 / 966 / leading 0, then a 5 and 8 more digits.
const SAUDI_MOBILE_RE = /^(\+?966|0)?5\d{8}$/;

const formSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  mobileNumber: z
    .string()
    .min(1, "Mobile number is required")
    .refine(
      (val) => SAUDI_MOBILE_RE.test(val.replace(/[\s-]/g, "")),
      "Enter a valid Saudi mobile (e.g. +966 5XXXXXXXX)",
    ),
  membershipId: z.string().optional(),
  applicationNumber: z.string().optional(),
  iqamaNumber: z.string().optional(),
  jamaath: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  designation: z.string().optional(),
  isExecutiveCommittee: z.boolean(),
  isCoreCommittee: z.boolean(),
  membershipFee: z.coerce.number().min(0, "Amount must be positive"),
  feeStatus: z.enum(FEE_STATUS_OPTIONS),
});

interface MemberFormProps {
  defaultValues?: Partial<MemberInput>;
  onSubmit: (data: MemberInput) => void;
  isSubmitting?: boolean;
}

export function MemberForm({ defaultValues, onSubmit, isSubmitting }: MemberFormProps) {
  const [refMember, setRefMember] = useState<MemberRefEntry | null>(
    defaultValues?.refMemberId
      ? {
          id: defaultValues.refMemberId,
          fullName: defaultValues.refMemberName || "",
          membershipId: "",
        }
      : null,
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: defaultValues?.fullName || "",
      mobileNumber: defaultValues?.mobileNumber || "",
      membershipId: defaultValues?.membershipId || "",
      applicationNumber: (defaultValues as any)?.applicationNumber || "",
      iqamaNumber: (defaultValues as any)?.iqamaNumber || "",
      jamaath: (defaultValues as any)?.jamaath || "",
      city: defaultValues?.city || "",
      country: defaultValues?.country || "",
      designation: (defaultValues as any)?.designation || "",
      isExecutiveCommittee: (defaultValues as any)?.isExecutiveCommittee === true,
      isCoreCommittee: (defaultValues as any)?.isCoreCommittee === true,
      membershipFee: defaultValues?.membershipFee ?? 100,
      feeStatus: (defaultValues?.feeStatus as (typeof FEE_STATUS_OPTIONS)[number]) || "unpaid",
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        fullName: defaultValues.fullName || "",
        mobileNumber: defaultValues.mobileNumber || "",
        membershipId: defaultValues.membershipId || "",
        applicationNumber: (defaultValues as any).applicationNumber || "",
        iqamaNumber: (defaultValues as any).iqamaNumber || "",
        jamaath: (defaultValues as any).jamaath || "",
        city: defaultValues.city || "",
        country: defaultValues.country || "",
        designation: (defaultValues as any).designation || "",
        isExecutiveCommittee: (defaultValues as any).isExecutiveCommittee === true,
        isCoreCommittee: (defaultValues as any).isCoreCommittee === true,
        membershipFee: defaultValues.membershipFee ?? 100,
        feeStatus: (defaultValues.feeStatus as (typeof FEE_STATUS_OPTIONS)[number]) || "unpaid",
      });
      setRefMember(
        defaultValues.refMemberId
          ? {
              id: defaultValues.refMemberId,
              fullName: defaultValues.refMemberName || "",
              membershipId: "",
            }
          : null,
      );
    }
  }, [defaultValues, form]);

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    onSubmit({
      ...data,
      refMemberId: refMember?.id || "",
      refMemberName: refMember?.fullName || "",
    } as MemberInput);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                  <Input placeholder="+966 5XXXXXXXX" {...field} />
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
                <FormLabel>Membership ID (auto if blank)</FormLabel>
                <FormControl>
                  <Input placeholder="Leave blank to auto-generate" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="applicationNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Application No</FormLabel>
                <FormControl>
                  <Input placeholder="APP-12345" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="iqamaNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Iqama No</FormLabel>
                <FormControl>
                  <Input placeholder="2xxxxxxxxx" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="jamaath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jamaath</FormLabel>
                <FormControl>
                  <Input placeholder="Nearest Jamaath" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Place / Location</FormLabel>
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
                  <Input placeholder="Saudi Arabia" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="designation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned Role</FormLabel>
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
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="isExecutiveCommittee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Executive Committee</FormLabel>
                <FormControl>
                  <select
                    value={field.value ? "yes" : "no"}
                    onChange={(e) => field.onChange(e.target.value === "yes")}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    className="w-full border border-input rounded-md px-3 h-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isCoreCommittee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Core Committee</FormLabel>
                <FormControl>
                  <select
                    value={field.value ? "yes" : "no"}
                    onChange={(e) => field.onChange(e.target.value === "yes")}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    className="w-full border border-input rounded-md px-3 h-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label>Reference Member — Who referred this member?</Label>
          <MemberRefPicker value={refMember} onChange={setRefMember} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="membershipFee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Membership Fee (SAR)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="feeStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee Status</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="w-full border border-input rounded-md px-3 h-10 text-sm bg-background capitalize focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {FEE_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="capitalize">
                        {opt}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Member"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
