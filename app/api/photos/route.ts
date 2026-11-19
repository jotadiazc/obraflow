import { env } from "cloudflare:workers";
import { getCurrentUser, isSameOriginRequest } from "../../auth";
import { withDb } from "../../../db";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  return withDb(async (sql) => {
    const user = await getCurrentUser(sql);
    if (!user) return json({ error: "Debes iniciar sesión para subir fotos." }, 401);
    if (!env.BUCKET) return json({ error: "El almacenamiento de fotos todavía no está disponible." }, 503);
    let body: { orderId?: string; dataUrl?: string };
    try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl ?? ""));
    if (!match) return json({ error: "La imagen debe ser JPEG, PNG o WebP." }, 400);
    if (match[2].length > 1_400_000) return json({ error: "La foto supera el tamaño máximo permitido." }, 413);
    const [state] = await sql<{ data_json: any }[]>`SELECT data_json FROM workspace_state WHERE workspace_id = ${user.workspaceId} LIMIT 1`;
    const order = state?.data_json?.orders?.find((item: any) => item.id === body.orderId);
    if (!order) return json({ error: "No se encontró la orden." }, 404);
    if (user.role === "operator" && order.assignedEmail !== user.email) return json({ error: "Solo puedes adjuntar fotos a tus órdenes asignadas." }, 403);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)); }
    catch { return json({ error: "La codificación de la imagen no es válida." }, 400); }
    if (bytes.byteLength > 1_000_000) return json({ error: "La foto supera el tamaño máximo permitido." }, 413);
    const id = crypto.randomUUID();
    const key = `${user.workspaceId}/${order.id}/${id}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: match[1] }, customMetadata: { workspaceId: user.workspaceId, orderId: order.id } });
    await sql`INSERT INTO photo_objects (id, workspace_id, order_id, object_key, content_type, created_by) VALUES (${id}, ${user.workspaceId}, ${order.id}, ${key}, ${match[1]}, ${user.userId})`;
    return json({ id, url: `/api/photos/${id}`, contentType: match[1] }, 201);
  });
}
