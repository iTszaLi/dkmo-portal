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

const SEED_USERS: ReadonlyArray<{
  id: string;
  username: string;
  displayName: string;
  role: Role;
  password: string;
}> = [
  { id: "u_admin1",   username: "admin1",   displayName: "Administrator",   role: "admin",   password: "dkmo@2026" },
  { id: "u_finance1", username: "finance1", displayName: "Finance Lead",    role: "finance", password: "dkmo@2026" },
  { id: "u_finance2", username: "finance2", displayName: "Finance Officer", role: "finance", password: "dkmo@2026" },
  { id: "u_event",    username: "event",    displayName: "Event Manager",   role: "event",   password: "dkmo@2026" },
  { id: "u_user1",    username: "user1",    displayName: "Viewer",          role: "viewer",  password: "dkmo@2026" },
];

const usersByUsername = new Map<string, ExecutiveUser>();
const usersById = new Map<string, ExecutiveUser>();

for (const seed of SEED_USERS) {
  const user: ExecutiveUser = {
    id: seed.id,
    username: seed.username,
    displayName: seed.displayName,
    role: seed.role,
    passwordHash: bcrypt.hashSync(seed.password, SALT_ROUNDS),
  };
  usersByUsername.set(seed.username.toLowerCase(), user);
  usersById.set(seed.id, user);
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<ExecutiveUser | null> {
  if (typeof username !== "string" || typeof password !== "string") return null;
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
