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
      monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount_paid NUMERIC(12,2) NOT NULL,
      payment_method TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      notes TEXT,
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

    CREATE TABLE IF NOT EXISTS frf_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      frf_number TEXT NOT NULL UNIQUE,
      member_id UUID REFERENCES members(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      date_of_birth DATE,
      blood_group TEXT NOT NULL DEFAULT '',
      marital_status TEXT NOT NULL DEFAULT '',
      num_dependents INTEGER NOT NULL DEFAULT 0,
      passport_number TEXT NOT NULL DEFAULT '',
      iqama_number TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT '',
      company_name TEXT NOT NULL DEFAULT '',
      mobile_saudi TEXT NOT NULL DEFAULT '',
      mobile_india TEXT NOT NULL DEFAULT '',
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
      emergency_name_india TEXT NOT NULL DEFAULT '',
      emergency_mobile_india TEXT NOT NULL DEFAULT '',
      nominee_name TEXT NOT NULL DEFAULT '',
      nominee_relation TEXT NOT NULL DEFAULT '',
      nominee_mobile TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted',
      photo_url TEXT,
      notes TEXT NOT NULL DEFAULT '',
      membership_date DATE NOT NULL DEFAULT '2024-01-01',
      renewal_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS frf_dependents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      frf_membership_id UUID NOT NULL REFERENCES frf_memberships(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT '',
      age INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  `);

  console.log("✅  All tables created.");
  await pool.end();
}

main().catch((e) => {
  console.error("❌  Migration failed:", e);
  process.exit(1);
});
