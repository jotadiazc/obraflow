import { getCurrentUser } from "../../../auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ user: user ? { email: user.email, displayName: user.displayName, role: user.role } : null }, { headers: { "cache-control": "no-store" } });
}
