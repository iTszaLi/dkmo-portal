import {
  Stethoscope,
  HandHeart,
  Siren,
  Plane,
  Globe2,
  type LucideIcon,
} from "lucide-react";

export type ServiceType =
  | "medical_aid"
  | "general_relief"
  | "emergency_response"
  | "air_ticket"
  | "india_rep";

export type WelfareStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "completed";

export const SERVICE_TYPES: ServiceType[] = [
  "medical_aid",
  "general_relief",
  "emergency_response",
  "air_ticket",
  "india_rep",
];

export const WELFARE_STATUSES: WelfareStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "completed",
];

export const STATUS_LABEL: Record<WelfareStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export const STATUS_STYLE: Record<WelfareStatus, string> = {
  submitted: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300/50",
  under_review: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300/50",
  approved: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 ring-1 ring-green-300/50",
  rejected: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-1 ring-red-300/50",
  completed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-300/50",
};

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "select" | "number";
  options?: string[];
  placeholder?: string;
}

export interface ServiceConfig {
  type: ServiceType;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind text color for the accent icon */
  accent: string;
  /** Tailwind classes for the icon tile background */
  tile: string;
  description: string;
  /** Whether monetary amounts are relevant for this service */
  hasAmount: boolean;
  fields: FieldDef[];
}

export const SERVICE_CONFIG: Record<ServiceType, ServiceConfig> = {
  medical_aid: {
    type: "medical_aid",
    label: "Medical Aid",
    shortLabel: "Medical",
    icon: Stethoscope,
    accent: "text-rose-600 dark:text-rose-400",
    tile: "bg-rose-100 dark:bg-rose-900/40",
    description: "Financial assistance for hospital bills, treatments, surgeries and medication for members and their families.",
    hasAmount: true,
    fields: [
      { key: "patientName", label: "Patient Name", type: "text" },
      { key: "hospitalName", label: "Hospital / Clinic", type: "text" },
      { key: "treatmentType", label: "Treatment Type", type: "text", placeholder: "e.g. Surgery, Dialysis" },
      { key: "medicalCondition", label: "Medical Condition", type: "textarea" },
    ],
  },
  general_relief: {
    type: "general_relief",
    label: "General Relief Fund",
    shortLabel: "Relief",
    icon: HandHeart,
    accent: "text-amber-600 dark:text-amber-400",
    tile: "bg-amber-100 dark:bg-amber-900/40",
    description: "Support for families facing financial hardship — food, rent, utilities, education and other essential needs.",
    hasAmount: true,
    fields: [
      { key: "reliefCategory", label: "Relief Category", type: "select", options: ["Food", "Rent", "Utilities", "Education", "Other"] },
      { key: "householdSize", label: "Household Size", type: "number" },
      { key: "situation", label: "Situation Summary", type: "textarea" },
    ],
  },
  emergency_response: {
    type: "emergency_response",
    label: "Emergency Response",
    shortLabel: "Emergency",
    icon: Siren,
    accent: "text-red-600 dark:text-red-400",
    tile: "bg-red-100 dark:bg-red-900/40",
    description: "Rapid help during accidents, natural disasters, deaths and other urgent crises affecting community members.",
    hasAmount: true,
    fields: [
      { key: "incidentType", label: "Incident Type", type: "select", options: ["Accident", "Natural Disaster", "Death", "Medical Emergency", "Other"] },
      { key: "incidentDate", label: "Incident Date", type: "date" },
      { key: "location", label: "Location", type: "text" },
      { key: "urgency", label: "Urgency", type: "select", options: ["Low", "Medium", "High", "Critical"] },
    ],
  },
  air_ticket: {
    type: "air_ticket",
    label: "Air Ticket Assistance",
    shortLabel: "Air Ticket",
    icon: Plane,
    accent: "text-sky-600 dark:text-sky-400",
    tile: "bg-sky-100 dark:bg-sky-900/40",
    description: "Help with travel costs for repatriation, emergency family visits and return of deceased members to home country.",
    hasAmount: true,
    fields: [
      { key: "beneficiaryName", label: "Traveller Name", type: "text" },
      { key: "origin", label: "From", type: "text", placeholder: "e.g. Riyadh" },
      { key: "destination", label: "To", type: "text", placeholder: "e.g. Mangalore" },
      { key: "travelDate", label: "Travel Date", type: "date" },
      { key: "travelReason", label: "Reason for Travel", type: "textarea" },
    ],
  },
  india_rep: {
    type: "india_rep",
    label: "India Representative Support",
    shortLabel: "India Rep",
    icon: Globe2,
    accent: "text-green-700 dark:text-green-400",
    tile: "bg-green-100 dark:bg-green-900/40",
    description: "On-ground coordination in India — documentation, hospital liaison, family support and legal assistance.",
    hasAmount: false,
    fields: [
      { key: "representativeName", label: "Representative", type: "text" },
      { key: "region", label: "Region / District", type: "text" },
      { key: "supportType", label: "Support Type", type: "select", options: ["Documentation", "Hospital Coordination", "Family Support", "Legal", "Other"] },
      { key: "beneficiaryName", label: "Beneficiary", type: "text" },
    ],
  },
};

export function isServiceType(v: string | undefined): v is ServiceType {
  return !!v && (SERVICE_TYPES as string[]).includes(v);
}
