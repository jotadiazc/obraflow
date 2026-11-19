import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function adminWorkspace(db: D1Database, userId: string) {
  return db.prepare("SELECT workspace_id FROM workspace_members WHERE user_id = ? AND role = 'admin' LIMIT 1")
    .bind(userId).first<{ workspace_id: string }>();
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Debes iniciar sesión." }, 401);
  const db = env.DB;
  if (!db) return json({ error: "La base de datos todavía no está disponible." }, 503);
  const member = await adminWorkspace(db, user.userId);
  if (!member) return json({ error: "Solo un administrador puede invitar personas." }, 403);
  let body: { email?: string; role?: string };
  try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role;
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Ingresa un correo válido para la invitación." }, 400);
  if (role !== "admin" && role !== "operator") return json({ error: "El perfil debe ser administrador u operario." }, 400);
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO workspace_invites (id, workspace_id, email, role, token_hash, expires_at, accepted_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)")
    .bind(id, member.workspace_id, email, role, tokenHash, expiresAt, user.userId, now.toISOString()).run();
  const inviteUrl = new URL("/", request.url);
  inviteUrl.searchParams.set("invite", token);
  return json({ id, email, role, expiresAt, inviteUrl: inviteUrl.toString() }, 201);
}
