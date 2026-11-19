import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Debes iniciar sesión para subir fotos." }, 401);
  if (!env.DB || !env.BUCKET) return json({ error: "El almacenamiento de fotos todavía no está disponible." }, 503);
  let body: { orderId?: string; dataUrl?: string };
  try { body = await request.json(); } catch { return json({ error: "Contenido inválido." }, 400); }
  const dataUrl = String(body.dataUrl ?? "");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return json({ error: "La imagen debe ser JPEG, PNG o WebP." }, 400);
  const encoded = match[2];
  if (encoded.length > 1_400_000) return json({ error: "La foto supera el tamaño máximo permitido." }, 413);

  const member = await env.DB.prepare("SELECT workspace_id, role, email FROM workspace_members WHERE user_id = ? LIMIT 1")
    .bind(user.userId).first<{ workspace_id: string; role: "admin" | "operator"; email: string }>();
  if (!member) return json({ error: "No tienes acceso a este espacio de trabajo." }, 403);
  const state = await env.DB.prepare("SELECT data_json FROM workspace_state WHERE workspace_id = ?")
    .bind(member.workspace_id).first<{ data_json: string | null }>();
  const order = state?.data_json ? JSON.parse(state.data_json).orders?.find((o: any) => o.id === body.orderId) : null;
  if (!order) return json({ error: "No se encontró la orden." }, 404);
  if (member.role === "operator" && order.assignedEmail !== member.email) return json({ error: "Solo puedes adjuntar fotos a tus órdenes asignadas." }, 403);

  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)); }
  catch { return json({ error: "La codificación de la imagen no es válida." }, 400); }
  if (bytes.byteLength > 1_000_000) return json({ error: "La foto supera el tamaño máximo permitido." }, 413);
  const id = crypto.randomUUID();
  const key = `${member.workspace_id}/${order.id}/${id}`;
  const now = new Date().toISOString();
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: match[1] },
    customMetadata: { workspaceId: member.workspace_id, orderId: order.id },
  });
  await env.DB.prepare("INSERT INTO photo_objects (id, workspace_id, order_id, object_key, content_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, member.workspace_id, order.id, key, match[1], user.userId, now).run();
  return json({ id, url: `/api/photos/${id}`, contentType: match[1] }, 201);
}
