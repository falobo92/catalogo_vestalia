import { clearSessionCookie } from "../../lib/auth.js";
import { json, methodNotAllowed, verifySameOrigin } from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!verifySameOrigin(req)) return json(res, 403, { ok: false, error: "Origen de solicitud no permitido." });
  const secure = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() === "https";
  res.setHeader("Set-Cookie", clearSessionCookie(secure));
  return json(res, 200, { ok: true });
}
