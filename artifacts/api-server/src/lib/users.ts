import bcrypt from "bcryptjs";

export type Role = "admin" | "finance" | "event" | "viewer";

export interface ExecutiveUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

const USERS: ReadonlyArray<ExecutiveUser> = [
  {
    id: "u_admin1",
    username: "admin1",
    displayName: "Administrator",
    role: "admin",
  },
  {
    id: "u_finance1",
    username: "finance1",
    displayName: "Finance Lead",
    role: "finance",
  },
  {
    id: "u_finance2",
    username: "finance2",
    displayName: "Finance Officer",
    role: "finance",
  },
  {
    id: "u_event",
    username: "event",
    displayName: "Event Manager",
    role: "event",
  },
  {
    id: "u_user1",
    username: "user1",
    displayName: "Viewer",
    role: "viewer",
  },
];

const usersByUsername = new Map<string, ExecutiveUser>();
const usersById = new Map<string, ExecutiveUser>();
const passwordHashPromises = new Map<string, Promise<string>>();

for (const user of USERS) {
  usersByUsername.set(user.username.toLowerCase(), user);
  usersById.set(user.id, user);
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<ExecutiveUser | null> {
  if (typeof username !== "string" || typeof password !== "string") return null;
  const u = usersByUsername.get(username.trim().toLowerCase());
  if (!u) {
    await bcrypt.hash(password, 10);
    return null;
  }

  const usernameKey = u.username.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const configuredPassword =
    process.env[`EXEC_PASSWORD_${usernameKey}`] ?? process.env["EXEC_PASSWORD"];
  if (!configuredPassword) {
    await bcrypt.hash(password, 10);
    return null;
  }

  let passwordHashPromise = passwordHashPromises.get(u.username);
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(configuredPassword, 10);
    passwordHashPromises.set(u.username, passwordHashPromise);
  }
  const ok = await bcrypt.compare(password, await passwordHashPromise);
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
