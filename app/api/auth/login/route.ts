import { createSessionToken, hashToken, isSameOriginRequest, SESSION_COOKIE, SESSION_SECONDS, sessionCookie, verifyPassword } from "../../../auth";
import { withDb } from "../../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 1 || password.length > 128) {
    return json({ error: "Correo o contraseña incorrectos." }, 401);
  }

  return withDb(async (sql) => {
    const [attempt] = await sql<{ attempts: number; window_started_at: Date; locked_until: Date | null }[]>`
      SELECT attempts, window_started_at, locked_until FROM login_attempts WHERE email = ${email}
    `;
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
      return json({ error: "Demasiados intentos. Prueba nuevamente en 15 minutos." }, 429);
    }

    const [user] = await sql<{ id: string; email: string; display_name: string; password_hash: string; active: boolean }[]>`
      SELECT id, email, display_name, password_hash, active FROM app_users WHERE email = ${email} LIMIT 1
    `;
    const valid = Boolean(user?.active && await verifyPassword(password, user.password_hash));
    if (!valid) {
      const [locked] = await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`;
        const [previous] = await tx<{ attempts: number; window_started_at: Date }[]>`
          SELECT attempts, window_started_at FROM login_attempts WHERE email = ${email} FOR UPDATE
        `;
        const reset = !previous || Date.now() - new Date(previous.window_started_at).getTime() > 15 * 60_000;
        const attempts = reset ? 1 : previous.attempts + 1;
        const [result] = await tx<{ locked_until: Date | null }[]>`
          INSERT INTO login_attempts (email, attempts, window_started_at, locked_until)
          VALUES (${email}, ${attempts}, ${new Date()}, ${attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null})
          ON CONFLICT (email) DO UPDATE SET attempts = EXCLUDED.attempts,
            window_started_at = EXCLUDED.window_started_at, locked_until = EXCLUDED.locked_until
          RETURNING locked_until
        `;
        return [result];
      });
      return json({ error: locked?.locked_until ? "Demasiados intentos. Prueba nuevamente en 15 minutos." : "Correo o contraseña incorrectos." }, locked?.locked_until ? 429 : 401);
    }

    const [membership] = await sql<{ role: "admin" | "operator"; workspace_id: string }[]>`
      SELECT role, workspace_id FROM workspace_members WHERE user_id = ${user!.id} LIMIT 1
    `;
    if (!membership) return json({ error: "La cuenta no tiene un espacio de trabajo activo." }, 403);
    await sql`DELETE FROM login_attempts WHERE email = ${email}`;
    const token = createSessionToken();
    await sql`INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (${crypto.randomUUID()}, ${user!.id}, ${await hashToken(token)}, ${new Date(Date.now() + SESSION_SECONDS * 1000)})`;
    const response = json({ authenticated: true, user: { email: user!.email, displayName: user!.display_name, role: membership.role } });
    response.headers.set("set-cookie", sessionCookie(token, request.url));
    return response;
  });
}
