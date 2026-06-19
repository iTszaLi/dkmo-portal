import { pool } from "@workspace/db";

async function main() {
  console.log("🗄️  Running migrations…");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      membership_id TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      designation TEXT NOT NULL DEFAULT '',
      membership_fee NUMERIC(12,2) NOT NULL DEFAULT 100,
      fee_status TEXT NOT NULL DEFAULT 'unpaid',
      fee_paid_at TIMESTAMPTZ,
      fee_updated_by TEXT NOT NULL DEFAULT '',
      ref_member_name TEXT NOT NULL DEFAULT '',
      ref_member_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      payment_type TEXT NOT NULL DEFAULT 'membership_fee',
      frf_claim_id UUID,
      amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      payment_method TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      notes TEXT,
      due_date TIMESTAMPTZ,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      event_date TIMESTAMPTZ,
      location TEXT NOT NULL DEFAULT '',
      budget NUMERIC(14,2) NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'upcoming',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sponsor_name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL DEFAULT 'bronze',
      total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_staff TEXT NOT NULL DEFAULT '',
      linked_event TEXT NOT NULL DEFAULT '',
      due_date TIMESTAMPTZ,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TIMESTAMPTZ,
      sponsor_id UUID REFERENCES sponsors(id) ON DELETE SET NULL,
      event_id UUID REFERENCES events(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS frf_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID REFERENCES members(id) ON DELETE SET NULL,
      claimant_name TEXT NOT NULL,
      membership_id TEXT NOT NULL DEFAULT '',
      claim_type TEXT NOT NULL DEFAULT 'death_benefit',
      amount_requested NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_approved NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      claim_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_date TIMESTAMPTZ,
      approved_by TEXT NOT NULL DEFAULT '',
      beneficiary_name TEXT NOT NULL DEFAULT '',
      beneficiary_relation TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS loans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID REFERENCES members(id) ON DELETE SET NULL,
      loan_type TEXT NOT NULL DEFAULT 'personal',
      principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      disbursed_date DATE,
      emi_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      emi_count INTEGER NOT NULL DEFAULT 0,
      paid_emis INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      convenor_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_number TEXT NOT NULL,
      receipt_date TEXT NOT NULL,
      member_name TEXT NOT NULL,
      dkmo_id TEXT NOT NULL DEFAULT '',
      jamath_name TEXT NOT NULL DEFAULT '',
      mobile_number TEXT NOT NULL DEFAULT '',
      whatsapp_number TEXT NOT NULL DEFAULT '',
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_types TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_sponsors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sponsor_name TEXT NOT NULL,
      contact_person TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      sponsorship_type TEXT NOT NULL DEFAULT 'cash',
      sponsorship_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      vendor TEXT NOT NULL DEFAULT '',
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      expense_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_ticket_booklets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      booklet_number TEXT NOT NULL,
      ticket_range_start INTEGER NOT NULL,
      ticket_range_end INTEGER NOT NULL,
      assigned_to TEXT NOT NULL DEFAULT '',
      assigned_date TEXT NOT NULL DEFAULT '',
      ticket_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booklet_id UUID NOT NULL REFERENCES event_ticket_booklets(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      ticket_number INTEGER NOT NULL,
      is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      sold_by TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_phone TEXT NOT NULL DEFAULT '',
      sale_date TEXT NOT NULL DEFAULT '',
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS membership_fee NUMERIC(12,2) NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS fee_status TEXT NOT NULL DEFAULT 'unpaid',
      ADD COLUMN IF NOT EXISTS fee_paid_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fee_updated_by TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS frf_status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS ref_member_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS ref_member_id TEXT NOT NULL DEFAULT '';

    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'membership_fee',
      ADD COLUMN IF NOT EXISTS frf_claim_id UUID,
      ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid',
      ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

    ALTER TABLE payments DROP COLUMN IF EXISTS month;

    ALTER TABLE frf_claims
      ADD COLUMN IF NOT EXISTS under_review_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS under_review_by TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS disbursed_by TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS rejected_by TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_notes TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      performed_by TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      tags TEXT NOT NULL DEFAULT '',
      file_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      expiry_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      linked_entity_id TEXT NOT NULL DEFAULT '',
      linked_entity_type TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      file_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure audit_logs has the new schema (user_id / user_name columns)
  await pool.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS user_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS entity_id TEXT,
      ADD COLUMN IF NOT EXISTS entity_name TEXT,
      ADD COLUMN IF NOT EXISTS details TEXT,
      ADD COLUMN IF NOT EXISTS ip_address TEXT;
  `);

  // DKMO Membership tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dkmo_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dkmo_number TEXT NOT NULL UNIQUE,
      member_id UUID REFERENCES members(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      date_of_birth DATE,
      blood_group TEXT NOT NULL DEFAULT '',
      marital_status TEXT NOT NULL DEFAULT '',
      family_in_saudi TEXT NOT NULL DEFAULT '',
      num_dependents INTEGER NOT NULL DEFAULT 0,
      passport_number TEXT NOT NULL DEFAULT '',
      iqama_number TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT '',
      company_name TEXT NOT NULL DEFAULT '',
      mobile_saudi TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      area_saudi TEXT NOT NULL DEFAULT '',
      po_box TEXT NOT NULL DEFAULT '',
      business_phone TEXT NOT NULL DEFAULT '',
      emergency_name_saudi TEXT NOT NULL DEFAULT '',
      emergency_mobile_saudi TEXT NOT NULL DEFAULT '',
      house_name TEXT NOT NULL DEFAULT '',
      postal_address TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      nearest_jamaath TEXT NOT NULL DEFAULT '',
      home_phone TEXT NOT NULL DEFAULT '',
      mobile_india TEXT NOT NULL DEFAULT '',
      emergency_name_india TEXT NOT NULL DEFAULT '',
      emergency_mobile_india TEXT NOT NULL DEFAULT '',
      photo_url TEXT,
      notes TEXT NOT NULL DEFAULT '',
      ref_member_name TEXT NOT NULL DEFAULT '',
      ref_member_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted',
      decline_reason TEXT,
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewed_at TIMESTAMPTZ,
      approved_by TEXT NOT NULL DEFAULT '',
      approved_at TIMESTAMPTZ,
      rejected_by TEXT NOT NULL DEFAULT '',
      rejected_at TIMESTAMPTZ,
      remarks TEXT NOT NULL DEFAULT '',
      membership_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dkmo_membership_dependents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dkmo_membership_id UUID NOT NULL REFERENCES dkmo_memberships(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT '',
      age INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS welfare_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_number TEXT NOT NULL UNIQUE,
      service_type TEXT NOT NULL,
      member_id UUID REFERENCES members(id) ON DELETE SET NULL,
      applicant_name TEXT NOT NULL,
      membership_id TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted',
      amount_requested NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_approved NUMERIC(12,2) NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      supporting_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
      assigned_to TEXT NOT NULL DEFAULT '',
      approval_notes TEXT NOT NULL DEFAULT '',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      under_review_at TIMESTAMPTZ,
      under_review_by TEXT NOT NULL DEFAULT '',
      approved_at TIMESTAMPTZ,
      approved_by TEXT NOT NULL DEFAULT '',
      rejected_at TIMESTAMPTZ,
      rejected_by TEXT NOT NULL DEFAULT '',
      completed_at TIMESTAMPTZ,
      completed_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION next_dkmo_number()
    RETURNS TEXT AS $$
    DECLARE
      seq INT;
    BEGIN
      SELECT COALESCE(MAX(CAST(SUBSTRING(dkmo_number FROM 6) AS INT)), 0) + 1
        INTO seq FROM dkmo_memberships;
      RETURN 'DKMO-' || LPAD(seq::TEXT, 4, '0');
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    ALTER TABLE sponsors
      ADD COLUMN IF NOT EXISTS transfer_method TEXT NOT NULL DEFAULT 'bank_transfer';
  `);

  // Member passport photo (carried over from the membership application on
  // approval). Backfill existing members from their linked DKMO membership.
  await pool.query(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS photo_url TEXT;
  `);
  await pool.query(`
    UPDATE members m
      SET photo_url = dm.photo_url
      FROM dkmo_memberships dm
      WHERE dm.member_id = m.id
        AND dm.photo_url IS NOT NULL
        AND (m.photo_url IS NULL OR m.photo_url = '');
  `);

  // Certificate serial number + approval audit trail for DKMO memberships.
  await pool.query(`
    ALTER TABLE dkmo_memberships
      ADD COLUMN IF NOT EXISTS certificate_number TEXT,
      ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approval_reference_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS approved_by_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS dkmo_memberships_certificate_number_unique
      ON dkmo_memberships (certificate_number)
      WHERE certificate_number IS NOT NULL;
  `);

  // Document-signing key material (self-signed RSA + X.509), one row per purpose.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_signing_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purpose TEXT NOT NULL UNIQUE,
      private_key_pem TEXT NOT NULL,
      cert_pem TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Replace the single committee_level enum with two fully independent boolean
  // flags. Add the columns, backfill from the legacy column (executive members
  // were also part of the core committee), then drop the legacy column.
  await pool.query(`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS is_executive_committee BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_core_committee BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'members' AND column_name = 'committee_level'
      ) THEN
        UPDATE members SET
          is_executive_committee = (committee_level = 'executive'),
          is_core_committee = (committee_level IN ('executive', 'core'));
        ALTER TABLE members DROP COLUMN committee_level;
      END IF;
    END $$;
  `);

  // Enforce uniqueness of DKMO membership accounts at the database level.
  // Rejected applications are excluded so applicants may re-apply after a
  // rejection; empty values are excluded so missing data does not collide.
  // Email is compared case-insensitively.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS dkmo_memberships_mobile_saudi_unique
      ON dkmo_memberships (mobile_saudi)
      WHERE status <> 'rejected' AND mobile_saudi <> '';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS dkmo_memberships_email_unique
      ON dkmo_memberships (lower(email))
      WHERE status <> 'rejected' AND email <> '';
  `);

  console.log("✅  All tables created.");
  await pool.end();
}

main().catch((e) => {
  console.error("❌  Migration failed:", e);
  process.exit(1);
});
