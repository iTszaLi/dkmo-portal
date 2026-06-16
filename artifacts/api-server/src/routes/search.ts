import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import {
  db,
  membersTable,
  paymentsTable,
  eventsTable,
  sponsorsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/search", requireAuth, async (req, res): Promise<void> => {
  const q = ((req.query.q as string) ?? "").trim();
  if (q.length < 2) {
    res.json({ members: [], payments: [], events: [], sponsors: [] });
    return;
  }

  const like = `%${q}%`;
  const LIMIT = 5;

  const [members, payments, events, sponsors] = await Promise.all([
    db
      .select({
        id: membersTable.id,
        fullName: membersTable.fullName,
        membershipId: membersTable.membershipId,
        city: membersTable.city,
        country: membersTable.country,
      })
      .from(membersTable)
      .where(
        or(
          ilike(membersTable.fullName, like),
          ilike(membersTable.membershipId, like),
          ilike(membersTable.city, like),
          ilike(membersTable.mobileNumber, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: paymentsTable.id,
        month: paymentsTable.month,
        amountPaid: paymentsTable.amountPaid,
        receiptNumber: paymentsTable.receiptNumber,
        paymentMethod: paymentsTable.paymentMethod,
        memberFullName: membersTable.fullName,
        memberMembershipId: membersTable.membershipId,
      })
      .from(paymentsTable)
      .leftJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
      .where(
        or(
          ilike(paymentsTable.receiptNumber, like),
          ilike(paymentsTable.month, like),
          ilike(membersTable.fullName, like),
          ilike(membersTable.membershipId, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        eventDate: eventsTable.eventDate,
        location: eventsTable.location,
        status: eventsTable.status,
      })
      .from(eventsTable)
      .where(or(ilike(eventsTable.name, like), ilike(eventsTable.location, like)))
      .limit(LIMIT),

    db
      .select({
        id: sponsorsTable.id,
        sponsorName: sponsorsTable.sponsorName,
        company: sponsorsTable.company,
        tier: sponsorsTable.tier,
      })
      .from(sponsorsTable)
      .where(
        or(
          ilike(sponsorsTable.sponsorName, like),
          ilike(sponsorsTable.company, like),
          ilike(sponsorsTable.email, like),
        ),
      )
      .limit(LIMIT),
  ]);

  res.json({
    members,
    payments: payments.map((p) => ({
      id: p.id,
      memberName: p.memberFullName ?? "Unknown",
      membershipId: p.memberMembershipId ?? "",
      month: p.month,
      amountPaid: p.amountPaid,
      receiptNumber: p.receiptNumber,
      paymentMethod: p.paymentMethod,
    })),
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      location: e.location,
      status: e.status,
      eventDate: e.eventDate ? e.eventDate.toISOString() : null,
    })),
    sponsors,
  });
});

export default router;
