import { pbkdf2 as pbkdf2Callback, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const pbkdf2 = promisify(pbkdf2Callback);
const connectionString = process.env.DATABASE_URL;
const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
const displayName = process.env.OWNER_NAME?.trim() || email;
const password = process.env.OWNER_PASSWORD;

if (!connectionString) throw new Error("Define DATABASE_URL.");
if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Define OWNER_EMAIL con un correo válido.");
if (!password || password.length < 12 || password.length > 128) throw new Error("OWNER_PASSWORD debe tener entre 12 y 128 caracteres.");

const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
try {
  const salt = randomBytes(16);
  const digest = await pbkdf2(password, salt, 310_000, 32, "sha256");
  const passwordHash = `pbkdf2_sha256$310000$${salt.toString("base64")}$${digest.toString("base64")}`;
  await sql.begin(async (tx) => {
    const [existing] = await tx`SELECT id FROM app_users LIMIT 1`;
    if (existing) throw new Error("Ya existe una cuenta. El alta inicial solo se permite en una base sin usuarios.");
    const userId = randomUUID();
    const workspaceId = randomUUID();
    await tx`INSERT INTO app_users (id, email, display_name, password_hash) VALUES (${userId}, ${email}, ${displayName}, ${passwordHash})`;
    await tx`INSERT INTO workspaces (id, name, owner_user_id) VALUES (${workspaceId}, 'Mi empresa', ${userId})`;
    await tx`INSERT INTO workspace_members (workspace_id, user_id, email, role) VALUES (${workspaceId}, ${userId}, ${email}, 'admin')`;
    await tx`INSERT INTO workspace_state (workspace_id, data_json, version) VALUES (${workspaceId}, NULL, 0)`;
  });
  console.log(`Cuenta administradora creada para ${email}.`);
} finally {
  await sql.end({ timeout: 1 });
}
