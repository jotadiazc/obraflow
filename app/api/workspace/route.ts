import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

type Member = { workspace_id: string; role: "admin" | "operator"; email: string };
type StateRow = { data_json: string | null; version: number };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function currentMember(db: D1Database, userId: string) {
  return db.prepare("SELECT workspace_id, role, email FROM workspace_members WHERE user_id = ? LIMIT 1")
    .bind(userId).first<Member>();
}

async function ensureMember(db: D1Database, user: { userId: string; email: string; displayName: string }) {
  let member = await currentMember(db, user.userId);
  if (member) return member;

  const workspaceId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO workspaces (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(workspaceId, "Mi empresa", user.userId, now),
    db.prepare("INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, email, role, joined_at) VALUES (?, ?, ?, 'admin', ?)")
      .bind(workspaceId, user.userId, user.email.toLowerCase(), now),
    db.prepare("INSERT OR IGNORE INTO workspace_state (workspace_id, data_json, version, updated_at) VALUES (?, NULL, 0, ?)")
      .bind(workspaceId, now),
  ]);
  member = await currentMember(db, user.userId);
  return member;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Debes iniciar sesión para usar ObraFlow." }, 401);
  const db = env.DB;
  if (!db) return json({ error: "La base de datos todavía no está disponible." }, 503);

  const member = await ensureMember(db, user);
  if (!member) return json({ error: "No se pudo cargar tu espacio de trabajo." }, 500);
  const [workspace, state] = await Promise.all([
    db.prepare("SELECT id, name FROM workspaces WHERE id = ?").bind(member.workspace_id).first<{ id: string; name: string }>(),
    db.prepare("SELECT data_json, version FROM workspace_state WHERE workspace_id = ?").bind(member.workspace_id).first<StateRow>(),
  ]);
  const members = member.role === "admin"
    ? await db.prepare("SELECT email, role, joined_at FROM workspace_members WHERE workspace_id = ? ORDER BY joined_at")
      .bind(member.workspace_id).all()
    : null;
  const invites = member.role === "admin"
    ? await db.prepare("SELECT id, email, role, expires_at FROM workspace_invites WHERE workspace_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC")
      .bind(member.workspace_id, new Date().toISOString()).all()
    : null;

  const fullData = state?.data_json ? JSON.parse(state.data_json) : null;
  const visibleData = fullData && member.role === "operator"
    ? (() => {
        const orders = fullData.orders.filter((order: any) => order.assignedEmail === member.email);
        const ids = new Set(orders.map((order: any) => order.id));
        return { ...fullData, orders, receipts: (fullData.receipts ?? []).filter((receipt: any) => ids.has(receipt.orderId)), activity: [] };
      })()
    : fullData;
  return json({ workspace, role: member.role, profile: { email: user.email, displayName: user.displayName }, version: state?.version ?? 0,
    data: visibleData,
    members: members?.results ?? null, invites: invites?.results ?? null });
}

function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function isPrefix(oldList: unknown, newList: unknown) {
  if (!Array.isArray(oldList) || !Array.isArray(newList) || newList.length < oldList.length) return false;
  return oldList.every((value, index) => equal(value, newList[index]));
}

function operatorChangeAllowed(oldData: any, next: any, memberEmail: string) {
  if (!oldData || !next || !Array.isArray(oldData.orders) || !Array.isArray(next.orders)) return false;
  const eligible = oldData.orders.filter((o: any) => o.assignedEmail === memberEmail);
  if (eligible.length !== next.orders.length) return false;
  const eligibleIds = new Set(eligible.map((o: any) => o.id));
  if (!Array.isArray(next.receipts) || next.receipts.some((r: any) => !eligibleIds.has(r.orderId))) return false;
  const oldReceipts = (oldData.receipts ?? []).filter((r: any) => eligibleIds.has(r.orderId));
  if (!isPrefix(oldReceipts, next.receipts)) return false;
  const oldOrders = new Map(eligible.map((o: any) => [o.id, o]));
  for (const n of next.orders) {
    const o: any = oldOrders.get(n.id);
    if (!o || o.code !== n.code || o.name !== n.name || o.client !== n.client || o.type !== n.type || o.address !== n.address || o.contact !== n.contact || o.phone !== n.phone || o.email !== n.email || o.assigned !== n.assigned || o.date !== n.date || o.invoice !== n.invoice || o.paidDate !== n.paidDate) return false;
    if (!isPrefix(o.progress ?? [], n.progress ?? []) || !isPrefix(o.receipts ?? [], n.receipts ?? [])) return false;
    if (!Array.isArray(o.parts) || !Array.isArray(n.parts) || o.parts.length !== n.parts.length) return false;
    for (let i = 0; i < o.parts.length; i++) {
      const before = o.parts[i], after = n.parts[i];
      if (before.name !== after.name || before.planned !== after.planned || after.done < before.done || after.done > after.planned || (after.received ?? 0) < (before.received ?? 0) || (after.received ?? 0) > after.done) return false;
    }
    if (!new Set([o.status, "En curso", "Recepción parcial", "Lista para cobro"]).has(n.status)) return false;
  }
  return true;
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Debes iniciar sesión para guardar cambios." }, 401);
  const db = env.DB;
  if (!db) return json({ error: "La base de datos todavía no está disponible." }, 503);
  let body: { version?: number; data?: unknown };
  try { body = await request.json(); } catch { return json({ error: "El contenido enviado no es JSON válido." }, 400); }
  if (!Number.isInteger(body.version) || body.version! < 0 || !body.data || typeof body.data !== "object") return json({ error: "Falta la versión o los datos del espacio de trabajo." }, 400);
  const encoded = JSON.stringify(body.data);
  if (encoded.length > 4_000_000) return json({ error: "El respaldo supera el límite de 4 MB." }, 413);

  const member = await currentMember(db, user.userId);
  if (!member) return json({ error: "No tienes acceso a un espacio de trabajo." }, 403);
  const current = await db.prepare("SELECT data_json, version FROM workspace_state WHERE workspace_id = ?")
    .bind(member.workspace_id).first<StateRow>();
  if (!current) return json({ error: "No se encontró el espacio de trabajo." }, 404);
  if (current.version !== body.version) return json({ error: "Otra persona guardó cambios. Recarga los datos antes de continuar.", version: current.version, data: current.data_json ? JSON.parse(current.data_json) : null }, 409);
  let dataToSave: any = body.data;
  if (member.role === "operator") {
    const fullCurrent = current.data_json ? JSON.parse(current.data_json) : null;
    if (!operatorChangeAllowed(fullCurrent, body.data, member.email)) return json({ error: "El perfil operario solo puede agregar avances y recepciones en sus órdenes asignadas." }, 403);
    const visibleIds = new Set(body.data.orders.map((o: any) => o.id));
    const nextById = new Map(body.data.orders.map((o: any) => [o.id, o]));
    const nextReceipts = new Map(body.data.orders.map((o: any) => [o.id, o.receipts ?? []]));
    dataToSave = {
      ...fullCurrent,
      seq: Math.max(fullCurrent.seq ?? 0, body.data.seq ?? 0),
      orders: fullCurrent.orders.map((old: any) => {
        if (!visibleIds.has(old.id)) return old;
        const updated: any = nextById.get(old.id);
        return { ...old, status: updated.status, parts: updated.parts, progress: updated.progress, receipts: nextReceipts.get(old.id) };
      }),
      receipts: [...(fullCurrent.receipts ?? []), ...body.data.receipts.slice((fullCurrent.receipts ?? []).filter((r: any) => visibleIds.has(r.orderId)).length)],
    };
  }

  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE workspace_state SET data_json = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND version = ?")
    .bind(JSON.stringify(dataToSave), now, member.workspace_id, current.version).run();
  if (!result.meta.changes) {
    const latest = await db.prepare("SELECT data_json, version FROM workspace_state WHERE workspace_id = ?").bind(member.workspace_id).first<StateRow>();
    return json({ error: "Otra persona guardó cambios. Recarga los datos antes de continuar.", version: latest?.version ?? current.version, data: latest?.data_json ? JSON.parse(latest.data_json) : null }, 409);
  }
  return json({ version: current.version + 1, savedAt: now });
}
