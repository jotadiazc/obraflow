import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Inicia sesión con el correo invitado y vuelve a abrir el enlace." }, 401);
  const db = env.DB;
  if (!db) return json({ error: "La base de datos todavía no está disponible." }, 503);
  let body: { token?: string };
  try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
  const token = String(body.token ?? "");
  if (token.length < 30 || token.length > 200) return json({ error: "El enlace de invitación no es válido." }, 400);
  const invite = await db.prepare("SELECT id, workspace_id, email, role, expires_at, accepted_at FROM workspace_invites WHERE token_hash = ? LIMIT 1")
    .bind(await sha256(token)).first<{ id: string; workspace_id: string; email: string; role: "admin" | "operator"; expires_at: string; accepted_at: string | null }>();
  if (!invite || invite.accepted_at || invite.expires_at <= new Date().toISOString()) return json({ error: "La invitación venció o ya fue utilizada." }, 410);
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) return json({ error: `Esta invitación fue enviada a ${invite.email}. Inicia sesión con ese correo.` }, 403);
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, email, role, joined_at) VALUES (?, ?, ?, ?, ?)")
      .bind(invite.workspace_id, user.userId, user.email.toLowerCase(), invite.role, new Date().toISOString()),
    db.prepare("UPDATE workspace_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL")
      .bind(new Date().toISOString(), invite.id),
  ]);
  return json({ accepted: true, role: invite.role });
}
