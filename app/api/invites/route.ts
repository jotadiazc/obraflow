import { getCurrentUser, hashToken, isSameOriginRequest } from "../../auth";
import { withDb } from "../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  return withDb(async (sql) => {
    const user = await getCurrentUser(sql);
    if (!user) return json({ error: "Debes iniciar sesión." }, 401);
    if (user.role !== "admin") return json({ error: "Solo un administrador puede invitar personas." }, 403);
    let body: { email?: string; role?: string };
    try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role;
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Ingresa un correo válido." }, 400);
    if (email === user.email) return json({ error: "No puedes invitar tu propia cuenta." }, 400);
    if (role !== "admin" && role !== "operator") return json({ error: "El perfil debe ser administrador u operario." }, 400);
    const [existing] = await sql`SELECT id FROM app_users WHERE email = ${email} LIMIT 1`;
    if (existing) return json({ error: "Ese correo ya tiene una cuenta en ObraFlow." }, 409);

    const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
    const tokenHash = await hashToken(token);
    const id = crypto.randomUUID();
    const [invite] = await sql<{ expires_at: Date }[]>`
      INSERT INTO workspace_invites (id, workspace_id, email, role, token_hash, expires_at, created_by)
      VALUES (${id}, ${user.workspaceId}, ${email}, ${role}, ${tokenHash}, ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}, ${user.userId})
      RETURNING expires_at
    `;
    const inviteUrl = new URL("/", request.url);
    inviteUrl.searchParams.set("invite", token);
    return json({ id, email, role, expiresAt: invite.expires_at, inviteUrl: inviteUrl.toString() }, 201);
  });
}
