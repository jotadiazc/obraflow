import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ photoId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Debes iniciar sesión para ver esta foto." }, 401);
  if (!env.DB || !env.BUCKET) return json({ error: "El almacenamiento de fotos todavía no está disponible." }, 503);
  const { photoId } = await context.params;
  const member = await env.DB.prepare("SELECT workspace_id, role, email FROM workspace_members WHERE user_id = ? LIMIT 1")
    .bind(user.userId).first<{ workspace_id: string; role: "admin" | "operator"; email: string }>();
  if (!member) return json({ error: "No tienes acceso a este espacio de trabajo." }, 403);
  const photo = await env.DB.prepare("SELECT id, workspace_id, order_id, object_key, content_type FROM photo_objects WHERE id = ? AND workspace_id = ?")
    .bind(photoId, member.workspace_id).first<{ id: string; workspace_id: string; order_id: string; object_key: string; content_type: string }>();
  if (!photo) return json({ error: "No se encontró la foto." }, 404);
  if (member.role === "operator") {
    const state = await env.DB.prepare("SELECT data_json FROM workspace_state WHERE workspace_id = ?").bind(member.workspace_id).first<{ data_json: string | null }>();
    const order = state?.data_json ? JSON.parse(state.data_json).orders?.find((o: any) => o.id === photo.order_id) : null;
    if (!order || order.assignedEmail !== member.email) return json({ error: "No tienes acceso a esta foto." }, 403);
  }
  const object = await env.BUCKET.get(photo.object_key);
  if (!object) return json({ error: "El archivo de la foto no está disponible." }, 404);
  return new Response(object.body, { headers: {
    "content-type": photo.content_type,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  } });
}
