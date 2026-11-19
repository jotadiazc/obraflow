import { clearSessionCookie, hashToken, isSameOriginRequest, SESSION_COOKIE } from "../../../auth";
import { withDb } from "../../../../db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Solicitud no permitida." }, { status: 403 });
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) {
    await withDb(async (sql) => {
      await sql`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = ${await hashToken(token)} AND revoked_at IS NULL`;
    });
  }
  return new Response(null, { status: 303, headers: { location: new URL("/", request.url).toString(), "set-cookie": clearSessionCookie(request.url), "cache-control": "no-store" } });
}
