import { Router, type IRouter } from "express";
import { eq, desc, and, or, ilike, inArray, sql } from "drizzle-orm";
import {
  db,
  jobListingsTable,
  jobApplicationsTable,
  type JobDocument,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getUserById } from "../lib/users";
import { z } from "zod";

const router: IRouter = Router();
router.use("/job-listings", requireAuth);
router.use("/job-applications", requireAuth);
router.use("/job-bureau", requireAuth);

const uuidSchema = z.string().uuid();
function requireUuidParam(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if (!uuidSchema.safeParse(req.params["id"]).success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  next();
}

const JOB_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
] as const;
const LISTING_STATUSES = ["open", "closed", "filled"] as const;
const APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "interviewed",
  "placed",
  "rejected",
] as const;

const safeUrl = z
  .string()
  .refine((u) => /^\//.test(u) || /^https?:\/\//i.test(u), {
    message: "Document URL must be a relative path or an http(s) URL",
  });

const DocumentSchema = z.object({
  name: z.string(),
  url: safeUrl,
  uploadedAt: z.string().optional(),
});

const ListingInput = z.object({
  title: z.string().min(1),
  company: z.string().optional().default(""),
  location: z.string().optional().default(""),
  jobType: z.enum(JOB_TYPES).default("full_time"),
  salaryRange: z.string().optional().default(""),
  description: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contactNumber: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
  status: z.enum(LISTING_STATUSES).default("open"),
});

const ApplicationInput = z.object({
  memberId: z.string().uuid().nullable().optional(),
  applicantName: z.string().min(1),
  membershipId: z.string().optional().default(""),
  contactNumber: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
  cvDocuments: z.array(DocumentSchema).optional().default([]),
  status: z.enum(APPLICATION_STATUSES).default("applied"),
  notes: z.string().optional().default(""),
});

function actorName(req: unknown): string {
  const r = req as { userId?: string };
  return getUserById(r.userId ?? "")?.displayName ?? r.userId ?? "";
}

function listingToApi(
  row: typeof jobListingsTable.$inferSelect,
  counts?: { applicationCount: number; placedCount: number },
) {
  return {
    id: row.id,
    title: row.title,
    company: row.company ?? "",
    location: row.location ?? "",
    jobType: row.jobType,
    salaryRange: row.salaryRange ?? "",
    description: row.description ?? "",
    contactPerson: row.contactPerson ?? "",
    contactNumber: row.contactNumber ?? "",
    contactEmail: row.contactEmail ?? "",
    status: row.status,
    postedBy: row.postedBy ?? "",
    applicationCount: counts?.applicationCount ?? 0,
    placedCount: counts?.placedCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function applicationToApi(row: typeof jobApplicationsTable.$inferSelect) {
  return {
    id: row.id,
    listingId: row.listingId,
    memberId: row.memberId ?? null,
    applicantName: row.applicantName,
    membershipId: row.membershipId ?? "",
    contactNumber: row.contactNumber ?? "",
    contactEmail: row.contactEmail ?? "",
    cvDocuments: (row.cvDocuments ?? []) as JobDocument[],
    status: row.status,
    notes: row.notes ?? "",
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---- Listings ----

router.get("/job-listings", async (req, res): Promise<void> => {
  try {
    const { status, search } = req.query as Record<string, string>;
    const conditions = [];
    if (status && status !== "all") conditions.push(eq(jobListingsTable.status, status));
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(jobListingsTable.title, q),
          ilike(jobListingsTable.company, q),
          ilike(jobListingsTable.location, q),
          ilike(jobListingsTable.description, q),
        ),
      );
    }

    let query = db.select().from(jobListingsTable).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const rows = await query.orderBy(desc(jobListingsTable.createdAt));

    const ids = rows.map((r) => r.id);
    const countMap = new Map<string, { applicationCount: number; placedCount: number }>();
    if (ids.length > 0) {
      const counts = await db
        .select({
          listingId: jobApplicationsTable.listingId,
          total: sql<number>`count(*)::int`,
          placed: sql<number>`count(*) filter (where ${jobApplicationsTable.status} = 'placed')::int`,
        })
        .from(jobApplicationsTable)
        .where(inArray(jobApplicationsTable.listingId, ids))
        .groupBy(jobApplicationsTable.listingId);
      for (const c of counts) {
        countMap.set(c.listingId, {
          applicationCount: Number(c.total),
          placedCount: Number(c.placed),
        });
      }
    }

    res.json(rows.map((r) => listingToApi(r, countMap.get(r.id))));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list job listings" });
  }
});

router.get("/job-bureau/stats", async (req, res): Promise<void> => {
  try {
    const listings = await db.select().from(jobListingsTable);
    const apps = await db.select().from(jobApplicationsTable);

    const byListingStatus = (s: string) => listings.filter((l) => l.status === s).length;
    const byStatus = APPLICATION_STATUSES.map((s) => ({
      status: s,
      count: apps.filter((a) => a.status === s).length,
    }));

    res.json({
      totalListings: listings.length,
      openListings: byListingStatus("open"),
      closedListings: byListingStatus("closed"),
      filledListings: byListingStatus("filled"),
      totalApplications: apps.length,
      placements: apps.filter((a) => a.status === "placed").length,
      byStatus,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get job bureau stats" });
  }
});

router.post(
  "/job-listings",
  requireRole("admin", "finance"),
  async (req, res): Promise<void> => {
    const parsed = ListingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const data = parsed.data;
      const [created] = await db
        .insert(jobListingsTable)
        .values({
          title: data.title,
          company: data.company,
          location: data.location,
          jobType: data.jobType,
          salaryRange: data.salaryRange,
          description: data.description,
          contactPerson: data.contactPerson,
          contactNumber: data.contactNumber,
          contactEmail: data.contactEmail,
          status: data.status,
          postedBy: actorName(req),
        })
        .returning();
      logAudit(req, "job_listing_created", "job_bureau", {
        entityId: created.id,
        entityName: created.title,
        details: `${created.company || "—"} · ${created.status}`,
      });
      res.status(201).json(listingToApi(created));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to create job listing" });
    }
  },
);

router.get("/job-listings/:id", requireUuidParam, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [row] = await db.select().from(jobListingsTable).where(eq(jobListingsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        placed: sql<number>`count(*) filter (where ${jobApplicationsTable.status} = 'placed')::int`,
      })
      .from(jobApplicationsTable)
      .where(eq(jobApplicationsTable.listingId, id));
    res.json(
      listingToApi(row, {
        applicationCount: Number(counts?.total ?? 0),
        placedCount: Number(counts?.placed ?? 0),
      }),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get job listing" });
  }
});

router.put(
  "/job-listings/:id",
  requireRole("admin", "finance"),
  requireUuidParam,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const parsed = ListingInput.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const d = parsed.data;
      const updateData: Record<string, unknown> = {};
      if (d.title !== undefined) updateData.title = d.title;
      if (d.company !== undefined) updateData.company = d.company;
      if (d.location !== undefined) updateData.location = d.location;
      if (d.jobType !== undefined) updateData.jobType = d.jobType;
      if (d.salaryRange !== undefined) updateData.salaryRange = d.salaryRange;
      if (d.description !== undefined) updateData.description = d.description;
      if (d.contactPerson !== undefined) updateData.contactPerson = d.contactPerson;
      if (d.contactNumber !== undefined) updateData.contactNumber = d.contactNumber;
      if (d.contactEmail !== undefined) updateData.contactEmail = d.contactEmail;
      if (d.status !== undefined) updateData.status = d.status;

      const [updated] = await db
        .update(jobListingsTable)
        .set(updateData)
        .where(eq(jobListingsTable.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      logAudit(req, "job_listing_updated", "job_bureau", {
        entityId: updated.id,
        entityName: updated.title,
        details: `${updated.company || "—"} · ${updated.status}`,
      });
      res.json(listingToApi(updated));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to update job listing" });
    }
  },
);

router.delete(
  "/job-listings/:id",
  requireRole("admin"),
  requireUuidParam,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    try {
      const [deleted] = await db
        .delete(jobListingsTable)
        .where(eq(jobListingsTable.id, id))
        .returning();
      if (!deleted) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      logAudit(req, "job_listing_deleted", "job_bureau", {
        entityId: deleted.id,
        entityName: deleted.title,
      });
      res.sendStatus(204);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to delete job listing" });
    }
  },
);

// ---- Applications ----

router.get("/job-listings/:id/applications", requireUuidParam, async (req, res): Promise<void> => {
  const listingId = req.params["id"] as string;
  try {
    const rows = await db
      .select()
      .from(jobApplicationsTable)
      .where(eq(jobApplicationsTable.listingId, listingId))
      .orderBy(desc(jobApplicationsTable.appliedAt));
    res.json(rows.map(applicationToApi));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list job applications" });
  }
});

router.post(
  "/job-listings/:id/applications",
  requireRole("admin", "finance"),
  requireUuidParam,
  async (req, res): Promise<void> => {
    const listingId = req.params["id"] as string;
    const parsed = ApplicationInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const [listing] = await db
        .select()
        .from(jobListingsTable)
        .where(eq(jobListingsTable.id, listingId));
      if (!listing) {
        res.status(404).json({ error: "Job listing not found" });
        return;
      }
      const data = parsed.data;
      const [created] = await db
        .insert(jobApplicationsTable)
        .values({
          listingId,
          memberId: data.memberId ?? null,
          applicantName: data.applicantName,
          membershipId: data.membershipId,
          contactNumber: data.contactNumber,
          contactEmail: data.contactEmail,
          cvDocuments: data.cvDocuments,
          status: data.status,
          notes: data.notes,
        })
        .returning();
      logAudit(req, "job_application_created", "job_bureau", {
        entityId: created.id,
        entityName: created.applicantName,
        details: `${listing.title} · ${created.status}`,
      });
      res.status(201).json(applicationToApi(created));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to create job application" });
    }
  },
);

router.put(
  "/job-applications/:id",
  requireRole("admin", "finance"),
  requireUuidParam,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const parsed = ApplicationInput.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const d = parsed.data;
      const updateData: Record<string, unknown> = {};
      if (d.memberId !== undefined) updateData.memberId = d.memberId ?? null;
      if (d.applicantName !== undefined) updateData.applicantName = d.applicantName;
      if (d.membershipId !== undefined) updateData.membershipId = d.membershipId;
      if (d.contactNumber !== undefined) updateData.contactNumber = d.contactNumber;
      if (d.contactEmail !== undefined) updateData.contactEmail = d.contactEmail;
      if (d.cvDocuments !== undefined) updateData.cvDocuments = d.cvDocuments;
      if (d.status !== undefined) updateData.status = d.status;
      if (d.notes !== undefined) updateData.notes = d.notes;

      const [updated] = await db
        .update(jobApplicationsTable)
        .set(updateData)
        .where(eq(jobApplicationsTable.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const action =
        d.status === "placed"
          ? "job_application_placed"
          : d.status === "rejected"
            ? "job_application_rejected"
            : "job_application_updated";
      logAudit(req, action, "job_bureau", {
        entityId: updated.id,
        entityName: updated.applicantName,
        details: updated.status,
      });
      res.json(applicationToApi(updated));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to update job application" });
    }
  },
);

router.delete(
  "/job-applications/:id",
  requireRole("admin"),
  requireUuidParam,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    try {
      const [deleted] = await db
        .delete(jobApplicationsTable)
        .where(eq(jobApplicationsTable.id, id))
        .returning();
      if (!deleted) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      logAudit(req, "job_application_deleted", "job_bureau", {
        entityId: deleted.id,
        entityName: deleted.applicantName,
      });
      res.sendStatus(204);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to delete job application" });
    }
  },
);

export default router;
