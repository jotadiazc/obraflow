import { getCurrentUser, hashPassword, isSameOriginRequest } from "../../../../auth";
import { withDb } from "../../../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  return withDb(async (sql) => {
    const actor = await getCurrentUser(sql);
    if (!actor) return json({ error: "Debes iniciar sesión." }, 401);
    if (actor.role !== "admin") return json({ error: "Solo un administrador puede gestionar cuentas." }, 403);
    const { userId } = await context.params;
    if (userId === actor.userId) return json({ error: "No puedes cambiar tu propia cuenta desde esta pantalla." }, 400);
    let body: { action?: string; active?: boolean; password?: string };
    try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
    const [target] = await sql<{ id: string; role: "admin" | "operator"; active: boolean }[]>`
      SELECT m.user_id AS id, m.role, u.active FROM workspace_members m
      JOIN app_users u ON u.id = m.user_id
      WHERE m.workspace_id = ${actor.workspaceId} AND m.user_id = ${userId} LIMIT 1
    `;
    if (!target) return json({ error: "No se encontró la cuenta." }, 404);

    if (body.action === "reset-password") {
      const password = String(body.password ?? "");
      if (password.length < 12 || password.length > 128) return json({ error: "La contraseña debe tener entre 12 y 128 caracteres." }, 400);
      const passwordHash = await hashPassword(password);
      await sql.begin(async (tx) => {
        await tx`UPDATE app_users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${userId}`;
        await tx`UPDATE user_sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
      });
      return json({ updated: true, sessionsRevoked: true });
    }

    if (body.action === "set-active" && typeof body.active === "boolean") {
      if (!body.active && target.role === "admin") {
        const [row] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM workspace_members m JOIN app_users u ON u.id = m.user_id
          WHERE m.workspace_id = ${actor.workspaceId} AND m.role = 'admin' AND u.active = true
        `;
        if ((row?.count ?? 0) < 2) return json({ error: "No puedes desactivar al último administrador activo." }, 400);
      }
      await sql.begin(async (tx) => {
        await tx`UPDATE app_users SET active = ${body.active}, updated_at = now() WHERE id = ${userId}`;
        if (!body.active) await tx`UPDATE user_sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
      });
      return json({ updated: true, active: body.active });
    }
    return json({ error: "Acción de administración no válida." }, 400);
  });
}
