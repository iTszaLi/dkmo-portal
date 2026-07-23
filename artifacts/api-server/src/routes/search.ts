import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import {
  db,
  membersTable,
  paymentsTable,
  eventsTable,
  sponsorsTable,
  frfClaimsTable,
  loansTable,
  welfareRequestsTable,
  documentsTable,
  dkmoMembershipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const LIMIT = 5;

router.get("/search", requireAuth, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ members: [], payments: [], events: [], sponsors: [], claims: [], loans: [], welfare: [], documents: [], applications: [] });
    return;
  }
  const like = `%${q}%`;

  const [members, payments, events, sponsors, claims, loans, welfare, documents, applications] = await Promise.all([
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
          ilike(membersTable.mobileNumber, like),
          ilike(membersTable.iqamaNumber, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: paymentsTable.id,
        paymentType: paymentsTable.paymentType,
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

    db
      .select({
        id: frfClaimsTable.id,
        title: frfClaimsTable.title,
        claimantName: frfClaimsTable.claimantName,
        beneficiaryName: frfClaimsTable.beneficiaryName,
        claimType: frfClaimsTable.claimType,
        caseStatus: frfClaimsTable.status,
      })
      .from(frfClaimsTable)
      .where(
        or(
          ilike(frfClaimsTable.title, like),
          ilike(frfClaimsTable.claimantName, like),
          ilike(frfClaimsTable.beneficiaryName, like),
          ilike(frfClaimsTable.membershipId, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: loansTable.id,
        loanType: loansTable.loanType,
        principalAmount: loansTable.principalAmount,
        status: loansTable.status,
        memberFullName: membersTable.fullName,
        memberMembershipId: membersTable.membershipId,
      })
      .from(loansTable)
      .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
      .where(
        or(
          ilike(membersTable.fullName, like),
          ilike(membersTable.membershipId, like),
          ilike(loansTable.convenorName, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: welfareRequestsTable.id,
        requestNumber: welfareRequestsTable.requestNumber,
        serviceType: welfareRequestsTable.serviceType,
        applicantName: welfareRequestsTable.applicantName,
        status: welfareRequestsTable.status,
      })
      .from(welfareRequestsTable)
      .where(
        or(
          ilike(welfareRequestsTable.requestNumber, like),
          ilike(welfareRequestsTable.applicantName, like),
          ilike(welfareRequestsTable.membershipId, like),
        ),
      )
      .limit(LIMIT),

    db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        fileName: documentsTable.fileName,
        category: documentsTable.category,
        fileUrl: documentsTable.fileUrl,
      })
      .from(documentsTable)
      .where(or(ilike(documentsTable.title, like), ilike(documentsTable.fileName, like)))
      .limit(LIMIT),

    db
      .select({
        id: dkmoMembershipsTable.id,
        dkmoNumber: dkmoMembershipsTable.dkmoNumber,
        fullName: dkmoMembershipsTable.fullName,
        status: dkmoMembershipsTable.status,
      })
      .from(dkmoMembershipsTable)
      .where(
        or(
          ilike(dkmoMembershipsTable.dkmoNumber, like),
          ilike(dkmoMembershipsTable.fullName, like),
          ilike(dkmoMembershipsTable.passportNumber, like),
          ilike(dkmoMembershipsTable.iqamaNumber, like),
          ilike(dkmoMembershipsTable.mobileSaudi, like),
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
      paymentType: p.paymentType,
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
    claims,
    loans: loans.map((l) => ({
      id: l.id,
      loanType: l.loanType,
      principalAmount: l.principalAmount,
      status: l.status,
      memberName: l.memberFullName ?? "Unknown",
      membershipId: l.memberMembershipId ?? "",
    })),
    welfare,
    documents,
    applications,
  });
});

export default router;
