import { clearLoginFailures, loginStatus, registerLoginFailure } from "../../lib/db.js";
import { clientIp, createSession, hashIp, sessionCookie, verifyPassword } from "../../lib/auth.js";
import { json, methodNotAllowed, readJson, verifySameOrigin } from "../../lib/http.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
    if (!verifySameOrigin(req)) return json(res, 403, { ok: false, error: "Origen de solicitud no permitido." });
    if (!process.env.ADMIN_PASSWORD_HASH || !process.env.SESSION_SECRET) {
      return json(res, 503, { ok: false, error: "El acceso administrativo todavía no está configurado." });
    }

    const ipHash = hashIp(clientIp(req));
    const current = await loginStatus(ipHash);
    if (current.blocked) {
      res.setHeader("Retry-After", "900");
      return json(res, 429, { ok: false, error: "Demasiados intentos. Espera 15 minutos antes de probar nuevamente." });
    }

    const payload = await readJson(req, 4096);
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (!password || !verifyPassword(password)) {
      await registerLoginFailure(ipHash);
      const next = await loginStatus(ipHash);
      return json(res, 401, { ok: false, error: "Contraseña incorrecta.", remaining: next.remaining });
    }

    await clearLoginFailures(ipHash);
    const secure = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() === "https";
    res.setHeader("Set-Cookie", sessionCookie(createSession(), secure));
    return json(res, 200, { ok: true });
  } catch (error) {
    const status = /tamaño permitido|JSON válido/i.test(error.message) ? 400 : 500;
    return json(res, status, { ok: false, error: status === 500 ? "No fue posible iniciar sesión." : error.message });
  }
}
