import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createSession, hashPassword, isAuthenticated, verifyPassword } from "../lib/auth.js";

test("hash scrypt valida solo la contraseña correcta", () => {
  const encoded = hashPassword("una contraseña suficientemente larga", Buffer.alloc(16, 7));
  assert.equal(verifyPassword("una contraseña suficientemente larga", encoded), true);
  assert.equal(verifyPassword("incorrecta", encoded), false);
});

test("hash PBKDF2 generado en el navegador es compatible", () => {
  const salt = Buffer.alloc(16, 4);
  const derived = crypto.pbkdf2Sync("contraseña de prueba", salt, 310000, 64, "sha256");
  const encoded = `pbkdf2$310000$sha256$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  assert.equal(verifyPassword("contraseña de prueba", encoded), true);
  assert.equal(verifyPassword("otra", encoded), false);
});

test("la sesión firmada vence y detecta manipulaciones", () => {
  process.env.SESSION_SECRET = "secreto-de-prueba-no-publicar";
  const now = Date.now();
  const token = createSession(now);
  const request = { headers: { cookie: `vestalia_session=${token}` } };
  assert.equal(isAuthenticated(request, now + 1000), true);
  assert.equal(isAuthenticated(request, now + 13 * 60 * 60 * 1000), false);
  request.headers.cookie += "x";
  assert.equal(isAuthenticated(request, now + 1000), false);
});
