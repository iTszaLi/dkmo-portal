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
import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";

const PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const PHOTO_SIZE = 512;

/** Center-crop the image to a square and downscale to PHOTO_SIZE, returning a jpeg data URL. */
function fileToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

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

const FEE_STATUS_OPTIONS = ["unpaid", "pending", "partial", "paid", "exempt"] as const;

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
  dateOfBirth: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date"),
  designation: z.string().optional(),
  isExecutiveCommittee: z.boolean(),
  isCoreCommittee: z.boolean(),
  membershipFee: z.coerce.number().min(0, "Amount must be positive"),
  feeStatus: z.enum(FEE_STATUS_OPTIONS),
  responsibility: z.enum(["responsible", "not_responsible"]),
  notes: z.string().optional(),
});

interface MemberFormProps {
  defaultValues?: Partial<MemberInput>;
  onSubmit: (data: MemberInput) => void;
  isSubmitting?: boolean;
}

export function MemberForm({ defaultValues, onSubmit, isSubmitting }: MemberFormProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(
    (defaultValues as any)?.photoUrl ?? null,
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
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
      dateOfBirth: (defaultValues as any)?.dateOfBirth || "",
      designation: (defaultValues as any)?.designation || "",
      isExecutiveCommittee: (defaultValues as any)?.isExecutiveCommittee === true,
      isCoreCommittee: (defaultValues as any)?.isCoreCommittee === true,
      membershipFee: defaultValues?.membershipFee ?? 100,
      feeStatus: (defaultValues?.feeStatus as (typeof FEE_STATUS_OPTIONS)[number]) || "unpaid",
      responsibility: ((defaultValues as any)?.responsibility === "responsible" ? "responsible" : "not_responsible") as "responsible" | "not_responsible",
      notes: (defaultValues as any)?.notes || "",
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
        dateOfBirth: (defaultValues as any)?.dateOfBirth || "",
        designation: (defaultValues as any).designation || "",
        isExecutiveCommittee: (defaultValues as any).isExecutiveCommittee === true,
        isCoreCommittee: (defaultValues as any).isCoreCommittee === true,
        membershipFee: defaultValues.membershipFee ?? 100,
        feeStatus: (defaultValues.feeStatus as (typeof FEE_STATUS_OPTIONS)[number]) || "unpaid",
        responsibility: ((defaultValues as any)?.responsibility === "responsible" ? "responsible" : "not_responsible") as "responsible" | "not_responsible",
        notes: (defaultValues as any)?.notes || "",
      });
      setPhotoDataUrl((defaultValues as any)?.photoUrl ?? null);
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
      photoUrl: photoDataUrl,
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
                <FormLabel>DKMO ID</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Auto-assigned (e.g. DKMO-0041)"
                    {...field}
                    disabled
                  />
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
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of Birth</FormLabel>
                <FormControl>
                  <Input type="date" data-testid="input-date-of-birth" {...field} />
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
          <div className="space-y-2">
            <Label>Member Photo</Label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              data-testid="input-member-photo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!PHOTO_TYPES.includes(file.type.toLowerCase())) {
                  setPhotoError("Please choose a JPG, PNG, or WEBP image");
                  return;
                }
                try {
                  setPhotoError(null);
                  setPhotoDataUrl(await fileToSquareDataUrl(file));
                } catch {
                  setPhotoError("Could not process this image");
                }
              }}
            />
            <div className="flex items-center gap-3">
              {photoDataUrl ? (
                <div className="relative shrink-0">
                  <img
                    src={photoDataUrl}
                    alt="Member photo preview"
                    className="h-10 w-10 rounded-full object-cover border border-input"
                    data-testid="img-member-photo-preview"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    data-testid="button-remove-member-photo"
                    onClick={() => setPhotoDataUrl(null)}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 justify-start text-muted-foreground font-normal"
                onClick={() => photoInputRef.current?.click()}
                data-testid="button-upload-member-photo"
              >
                <Upload className="mr-2 h-4 w-4" />
                {photoDataUrl ? "Change Photo" : "Upload Photo"}
              </Button>
            </div>
            {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
          </div>
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
        <div className="grid grid-cols-1 gap-4">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks / Notes</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    rows={3}
                    placeholder="Internal remarks about this member (visible to admins only)"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  />
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
