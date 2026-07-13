import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Vercel publica enlaces cortos y estables", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const rewrites = Object.fromEntries(config.rewrites.map(item => [item.source, item.destination]));
  assert.equal(rewrites["/c"], "/api/pdf?tipo=a4");
  assert.equal(rewrites["/m"], "/api/pdf?tipo=movil");
  assert.equal(rewrites["/e"], "/editor.html");
  assert.equal(rewrites["/p"], "/index.html?catalogo=personas");
  assert.equal(rewrites["/p/e"], "/editor.html?catalogo=personas");
  assert.equal(rewrites["/p/c"], "/api/pdf?tipo=a4&catalogo=personas");
  assert.equal(rewrites["/p/m"], "/api/pdf?tipo=movil&catalogo=personas");
});
