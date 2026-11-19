import { cookies } from "next/headers";
import { withDb, type Sql } from "../db";

export const SESSION_COOKIE = "obraflow_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "operator";
  workspaceId: string;
};

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new Error("La contraseña debe tener entre 12 y 128 caracteres.");
  }
  const iterations = 310_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationText, saltText, expectedText] = stored.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expectedText) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltText), iterations }, key, 256);
    const expected = fromBase64(expectedText);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i];
    return mismatch === 0;
  } catch {
    return false;
  }
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSessionToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function getCurrentUser(sql?: Sql): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const findUser = async (db: Sql) => {
    const [user] = await db<AuthUser[]>`
      SELECT u.id AS "userId", u.email, u.display_name AS "displayName",
             m.role, m.workspace_id AS "workspaceId"
      FROM user_sessions s
      JOIN app_users u ON u.id = s.user_id
      JOIN workspace_members m ON m.user_id = u.id
      WHERE s.token_hash = ${tokenHash}
        AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active = true
      LIMIT 1
    `;
    return user ?? null;
  };
  return sql ? findUser(sql) : withDb(findUser);
}

export function sessionCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin" || fetchSite === "same-site";
}
