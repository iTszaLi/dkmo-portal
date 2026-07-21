import { pool } from "@workspace/db";

async function main() {
  console.log("🔧  Creating DB functions…");
  console.log("  ℹ️  No custom DB functions to create.");

  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error("❌  Failed:", e);
  process.exit(1);
});
