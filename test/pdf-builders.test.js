import assert from "node:assert/strict";
import test from "node:test";
import { loadBundledCatalog } from "../lib/catalog.js";
import { buildA4Html, buildMobileHtml } from "../lib/pdf-builders.js";

test("los constructores crean ambos documentos completos", () => {
  const catalog = loadBundledCatalog();
  const a4 = buildA4Html(catalog, "https://vestalia.example");
  const mobile = buildMobileHtml(catalog, "https://vestalia.example");
  assert.equal(a4.pageCount, 18);
  assert.equal(mobile.pageCount, 32);
  assert.match(a4.html, /class="pdf-page cover-page"/);
  assert.match(mobile.html, /class="mobile-page mobile-cover"/);
  assert.match(a4.html, /<base href="https:\/\/vestalia\.example\/">/);
  assert.match(a4.html, /data:image\/jpeg;base64,/);
  assert.match(a4.html, /data:font\/ttf;base64,/);
  assert.doesNotMatch(a4.html, /src="assets\//);
  assert.doesNotMatch(mobile.html, /src="assets\//);
  assert.match(a4.html, /56988934627\?text=Hola%20Vestalia/);
  assert.match(mobile.html, /56988934627\?text=Hola%20Vestalia/);
  for (const product of catalog.products) {
    assert.match(a4.html, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(mobile.html, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("las imágenes nuevas alojadas en Blob mantienen su URL", () => {
  const catalog = loadBundledCatalog();
  catalog.products[0].image = "https://store.public.blob.vercel-storage.com/producto.webp";
  assert.match(buildMobileHtml(catalog, "https://vestalia.example").html, /https:\/\/store\.public\.blob\.vercel-storage\.com\/producto\.webp/);
});
