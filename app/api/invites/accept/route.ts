import { createSessionToken, hashPassword, hashToken, isSameOriginRequest, sessionCookie, SESSION_SECONDS } from "../../../auth";
import { withDb } from "../../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  let body: { token?: string; password?: string; displayName?: string };
  try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim().slice(0, 100);
  if (token.length < 30 || token.length > 200) return json({ error: "El enlace de invitación no es válido." }, 400);
  if (password.length < 12 || password.length > 128) return json({ error: "La contraseña debe tener entre 12 y 128 caracteres." }, 400);

  return withDb(async (sql) => {
    const tokenHash = await hashToken(token);
    const [invite] = await sql<{ id: string; workspace_id: string; email: string; role: "admin" | "operator"; expires_at: Date; accepted_at: Date | null }[]>`
      SELECT id, workspace_id, email, role, expires_at, accepted_at FROM workspace_invites WHERE token_hash = ${tokenHash} LIMIT 1
    `;
    if (!invite || invite.accepted_at || new Date(invite.expires_at).getTime() <= Date.now()) return json({ error: "La invitación venció o ya fue utilizada." }, 410);
    const [existing] = await sql`SELECT id FROM app_users WHERE email = ${invite.email.toLowerCase()} LIMIT 1`;
    if (existing) return json({ error: "Este correo ya tiene una cuenta. Pide al administrador que gestione su acceso." }, 409);

    let userId = "";
    let sessionToken = "";
    try {
      const passwordHash = await hashPassword(password);
      sessionToken = createSessionToken();
      userId = crypto.randomUUID();
      await sql.begin(async (tx) => {
        const [current] = await tx<{ id: string; workspace_id: string; email: string; role: "admin" | "operator"; expires_at: Date; accepted_at: Date | null }[]>`
          SELECT id, workspace_id, email, role, expires_at, accepted_at FROM workspace_invites WHERE id = ${invite.id} FOR UPDATE
        `;
        if (!current || current.accepted_at || new Date(current.expires_at).getTime() <= Date.now()) throw new Error("INVITATION_UNAVAILABLE");
        await tx`INSERT INTO app_users (id, email, display_name, password_hash) VALUES (${userId}, ${current.email.toLowerCase()}, ${displayName || current.email.split("@")[0]}, ${passwordHash})`;
        await tx`INSERT INTO workspace_members (workspace_id, user_id, email, role) VALUES (${current.workspace_id}, ${userId}, ${current.email.toLowerCase()}, ${current.role})`;
        await tx`UPDATE workspace_invites SET accepted_at = now() WHERE id = ${current.id} AND accepted_at IS NULL`;
        await tx`INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (${crypto.randomUUID()}, ${userId}, ${await hashToken(sessionToken)}, ${new Date(Date.now() + SESSION_SECONDS * 1000)})`;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVITATION_UNAVAILABLE") return json({ error: "La invitación venció o ya fue utilizada." }, 410);
      throw error;
    }
    const response = json({ accepted: true, role: invite.role });
    response.headers.set("set-cookie", sessionCookie(sessionToken, request.url));
    return response;
  });
}
