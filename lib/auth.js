import crypto from "node:crypto";

const COOKIE = "vestalia_session";
const SESSION_SECONDS = 12 * 60 * 60;

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function signature(value, secret = process.env.SESSION_SECRET || "") {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSession(now = Date.now()) {
  if (!process.env.SESSION_SECRET) throw new Error("Falta SESSION_SECRET.");
  const encoded = b64(JSON.stringify({ role: "admin", exp: now + SESSION_SECONDS * 1000 }));
  return `${encoded}.${signature(encoded)}`;
}

export function sessionCookie(token, secure = true) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure = true) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const split = part.indexOf("=");
    return [part.slice(0, split), part.slice(split + 1)];
  }));
}

export function isAuthenticated(req, now = Date.now()) {
  const token = cookies(req)[COOKIE];
  if (!token || !process.env.SESSION_SECRET) return false;
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return false;
  const expected = signature(encoded);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.role === "admin" && Number(payload.exp) > now;
  } catch {
    return false;
  }
}

export function requireAdmin(req) {
  if (!isAuthenticated(req)) {
    const error = new Error("Sesión administrativa requerida.");
    error.statusCode = 401;
    throw error;
  }
}

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password, encoded = process.env.ADMIN_PASSWORD_HASH || "") {
  const [kind, n, r, p, salt, expected] = encoded.split("$");
  if (kind === "pbkdf2" && n && salt && expected) {
    try {
      const actual = crypto.pbkdf2Sync(password, Buffer.from(salt, "base64url"), Number(n), 64, "sha256");
      const wanted = Buffer.from(expected, "base64url");
      return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
    } catch {
      return false;
    }
  }
  if (kind !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  try {
    const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), 64, { N: Number(n), r: Number(r), p: Number(p) });
    const wanted = Buffer.from(expected, "base64url");
    return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
  } catch {
    return false;
  }
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

export function hashIp(ip) {
  return crypto.createHash("sha256").update(`${process.env.SESSION_SECRET || "vestalia"}:${ip}`).digest("hex");
}
