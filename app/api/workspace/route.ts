import { getCurrentUser, isSameOriginRequest } from "../../auth";
import { withDb } from "../../../db";

export const dynamic = "force-dynamic";
type StateRow = { data_json: any; version: number };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET() {
  return withDb(async (sql) => {
    const user = await getCurrentUser(sql);
    if (!user) return json({ error: "Debes iniciar sesión para usar ObraFlow." }, 401);
    const [workspace, state] = await Promise.all([
      sql<{ id: string; name: string }[]>`SELECT id, name FROM workspaces WHERE id = ${user.workspaceId} LIMIT 1`,
      sql<StateRow[]>`SELECT data_json, version FROM workspace_state WHERE workspace_id = ${user.workspaceId} LIMIT 1`,
    ]).then(([workspaces, states]) => [workspaces[0], states[0]] as const);
    if (!workspace || !state) return json({ error: "No se encontró el espacio de trabajo." }, 404);
    const [members, invites] = user.role === "admin" ? await Promise.all([
      sql`SELECT m.user_id, m.email, m.role, m.joined_at, u.active FROM workspace_members m JOIN app_users u ON u.id = m.user_id WHERE m.workspace_id = ${user.workspaceId} ORDER BY m.joined_at`,
      sql`SELECT id, email, role, expires_at FROM workspace_invites WHERE workspace_id = ${user.workspaceId} AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
    ]) : [null, null];
    const fullData = state.data_json ?? null;
    const visibleData = fullData && user.role === "operator"
      ? (() => {
          const orders = fullData.orders.filter((order: any) => order.assignedEmail === user.email);
          const ids = new Set(orders.map((order: any) => order.id));
          return { ...fullData, orders, receipts: (fullData.receipts ?? []).filter((receipt: any) => ids.has(receipt.orderId)), activity: [] };
        })()
      : fullData;
    return json({ workspace, role: user.role, profile: { userId: user.userId, email: user.email, displayName: user.displayName }, version: state.version,
      data: visibleData, members, invites });
  });
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
  if (!isSameOriginRequest(request)) return json({ error: "Solicitud no permitida." }, 403);
  return withDb(async (sql) => {
    const user = await getCurrentUser(sql);
    if (!user) return json({ error: "Debes iniciar sesión para guardar cambios." }, 401);
    let body: { version?: number; data?: unknown };
    try { body = await request.json(); } catch { return json({ error: "El contenido enviado no es JSON válido." }, 400); }
    if (!Number.isInteger(body.version) || body.version! < 0 || !body.data || typeof body.data !== "object") return json({ error: "Falta la versión o los datos del espacio de trabajo." }, 400);
    const encoded = JSON.stringify(body.data);
    if (encoded.length > 4_000_000) return json({ error: "El respaldo supera el límite de 4 MB." }, 413);
    const [current] = await sql<StateRow[]>`SELECT data_json, version FROM workspace_state WHERE workspace_id = ${user.workspaceId} LIMIT 1`;
    if (!current) return json({ error: "No se encontró el espacio de trabajo." }, 404);
    if (current.version !== body.version) return json({ error: "Otra persona guardó cambios. Recarga los datos antes de continuar.", version: current.version, data: current.data_json }, 409);

    let dataToSave: any = body.data;
    if (user.role === "operator") {
      const fullCurrent = current.data_json;
      if (!operatorChangeAllowed(fullCurrent, body.data, user.email)) return json({ error: "El perfil operario solo puede agregar avances y recepciones en sus órdenes asignadas." }, 403);
      const visibleIds = new Set((body.data as any).orders.map((o: any) => o.id));
      const nextById = new Map((body.data as any).orders.map((o: any) => [o.id, o]));
      const nextReceipts = new Map((body.data as any).orders.map((o: any) => [o.id, o.receipts ?? []]));
      dataToSave = {
        ...fullCurrent,
        seq: Math.max(fullCurrent.seq ?? 0, (body.data as any).seq ?? 0),
        orders: fullCurrent.orders.map((old: any) => {
          if (!visibleIds.has(old.id)) return old;
          const updated: any = nextById.get(old.id);
          return { ...old, status: updated.status, parts: updated.parts, progress: updated.progress, receipts: nextReceipts.get(old.id) };
        }),
        receipts: [...(fullCurrent.receipts ?? []), ...(body.data as any).receipts.slice((fullCurrent.receipts ?? []).filter((r: any) => visibleIds.has(r.orderId)).length)],
      };
    }

    const [saved] = await sql<{ version: number }[]>`
      UPDATE workspace_state SET data_json = ${JSON.stringify(dataToSave)}::jsonb, version = version + 1, updated_at = now()
      WHERE workspace_id = ${user.workspaceId} AND version = ${current.version} RETURNING version
    `;
    if (!saved) {
      const [latest] = await sql<StateRow[]>`SELECT data_json, version FROM workspace_state WHERE workspace_id = ${user.workspaceId} LIMIT 1`;
      return json({ error: "Otra persona guardó cambios. Recarga los datos antes de continuar.", version: latest?.version ?? current.version, data: latest?.data_json ?? null }, 409);
    }
    return json({ version: saved.version, savedAt: new Date().toISOString() });
  });
}
