export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  json(res, 405, { ok: false, error: "Método no permitido." });
}

export async function readBody(req, maximum = 5 * 1024 * 1024) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maximum) throw new Error("La solicitud supera el tamaño permitido.");
    return req.body;
  }
  if (typeof req.body === "string") {
    const body = Buffer.from(req.body);
    if (body.length > maximum) throw new Error("La solicitud supera el tamaño permitido.");
    return body;
  }
  if (req.body && typeof req.body === "object") {
    const body = Buffer.from(JSON.stringify(req.body));
    if (body.length > maximum) throw new Error("La solicitud supera el tamaño permitido.");
    return body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new Error("La solicitud supera el tamaño permitido.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, maximum) {
  const body = await readBody(req, maximum);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("El cuerpo no contiene JSON válido.");
  }
}

export function requestOrigin(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${forwarded}://${req.headers.host}`;
}

export function verifySameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

