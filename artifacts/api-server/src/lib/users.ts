import bcrypt from "bcryptjs";

export type Role = "admin" | "finance" | "event" | "viewer";

export interface ExecutiveUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
}

const SALT_ROUNDS = 10;

// Per-user password can be overridden with EXEC_PASSWORD_<USERNAME> (e.g.
// EXEC_PASSWORD_ADMIN1); EXEC_PASSWORD sets a shared default for all users.
// The hardcoded value is a development fallback only — set the secrets in
// production.
const DEFAULT_DEV_PASSWORD = "dkmo@2026";

function seedPassword(username: string): string {
  return (
    process.env[`EXEC_PASSWORD_${username.toUpperCase()}`] ||
    process.env.EXEC_PASSWORD ||
    DEFAULT_DEV_PASSWORD
  );
}

const SEED_USERS: ReadonlyArray<{
  id: string;
  username: string;
  displayName: string;
  role: Role;
}> = [
  { id: "u_admin1",   username: "admin1",   displayName: "Administrator",   role: "admin" },
  { id: "u_finance1", username: "finance1", displayName: "Finance Lead",    role: "finance" },
  { id: "u_finance2", username: "finance2", displayName: "Finance Officer", role: "finance" },
  { id: "u_event",    username: "event",    displayName: "Event Manager",   role: "event" },
  { id: "u_user1",    username: "user1",    displayName: "Viewer",          role: "viewer" },
];

const usersByUsername = new Map<string, ExecutiveUser>();
const usersById = new Map<string, ExecutiveUser>();

// Password hashing is deferred and async so server startup is never blocked
// by CPU-heavy bcrypt work (synchronous hashing at module load can stall the
// deployment health probe on cold starts).
let initPromise: Promise<void> | null = null;

function ensureUsers(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Identical seed passwords share one hash computation.
    const hashCache = new Map<string, string>();
    for (const seed of SEED_USERS) {
      const password = seedPassword(seed.username);
      let passwordHash = hashCache.get(password);
      if (!passwordHash) {
        passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        hashCache.set(password, passwordHash);
      }
      const user: ExecutiveUser = {
        id: seed.id,
        username: seed.username,
        displayName: seed.displayName,
        role: seed.role,
        passwordHash,
      };
      usersByUsername.set(seed.username.toLowerCase(), user);
      usersById.set(seed.id, user);
    }
  })();
  return initPromise;
}

// Warm the cache in the background without blocking module load.
void ensureUsers();

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<ExecutiveUser | null> {
  if (typeof username !== "string" || typeof password !== "string") return null;
  await ensureUsers();
  const u = usersByUsername.get(username.trim().toLowerCase());
  if (!u) {
    await bcrypt.compare(password, "$2a$10$" + "x".repeat(53));
    return null;
  }
  const ok = await bcrypt.compare(password, u.passwordHash);
  return ok ? u : null;
}

export function getUserById(id: string): ExecutiveUser | null {
  return usersById.get(id) ?? null;
}

export function publicUser(u: ExecutiveUser) {
  return {
    userId: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
  };
}
