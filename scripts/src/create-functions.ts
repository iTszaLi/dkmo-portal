import { pool } from "@workspace/db";

async function main() {
  console.log("🔧  Creating DB functions…");

  await pool.query(`
    CREATE OR REPLACE FUNCTION next_frf_number() RETURNS TEXT AS $$
    DECLARE
      max_num INTEGER;
      next_num INTEGER;
    BEGIN
      SELECT COALESCE(
        MAX(
          CAST(
            NULLIF(regexp_replace(frf_number, '[^0-9]', '', 'g'), '')
            AS INTEGER
          )
        ),
        2400
      )
      INTO max_num
      FROM frf_memberships;

      next_num := max_num + 1;
      RETURN 'FRF-' || LPAD(next_num::TEXT, 4, '0');
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log("  ✅  next_frf_number() created");

  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error("❌  Failed:", e);
  process.exit(1);
});
