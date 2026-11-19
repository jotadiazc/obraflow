import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { withDb } from "../../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ photoId: string }> }) {
  return withDb(async (sql) => {
    const user = await getCurrentUser(sql);
    if (!user) return json({ error: "Debes iniciar sesión para ver esta foto." }, 401);
    if (!env.BUCKET) return json({ error: "El almacenamiento de fotos todavía no está disponible." }, 503);
    const { photoId } = await context.params;
    const [photo] = await sql<{ id: string; workspace_id: string; order_id: string; object_key: string; content_type: string }[]>`
      SELECT id, workspace_id, order_id, object_key, content_type FROM photo_objects WHERE id = ${photoId} AND workspace_id = ${user.workspaceId} LIMIT 1
    `;
    if (!photo) return json({ error: "No se encontró la foto." }, 404);
    if (user.role === "operator") {
      const [state] = await sql<{ data_json: any }[]>`SELECT data_json FROM workspace_state WHERE workspace_id = ${user.workspaceId} LIMIT 1`;
      const order = state?.data_json?.orders?.find((item: any) => item.id === photo.order_id);
      if (!order || order.assignedEmail !== user.email) return json({ error: "No tienes acceso a esta foto." }, 403);
    }
    const object = await env.BUCKET.get(photo.object_key);
    if (!object) return json({ error: "El archivo de la foto no está disponible." }, 404);
    return new Response(object.body, { headers: { "content-type": photo.content_type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  });
}
