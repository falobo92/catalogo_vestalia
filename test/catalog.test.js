import assert from "node:assert/strict";
import test from "node:test";
import { CatalogError, loadBundledCatalog, normalizeCatalogChannel, validateCatalog } from "../lib/catalog.js";

test("el catálogo incluido contiene la colección completa", () => {
  const catalog = loadBundledCatalog();
  assert.equal(catalog.products.length, 27);
  assert.equal(catalog.categories.length, 9);
  assert.equal(catalog.contact.phone, "+56 9 8893 4627");
  assert.equal(catalog.contact.whatsappUrl, "https://wa.me/56988934627");
  assert.match(catalog.contact.genericMessage, /información para mi cafetería/);
  assert.match(catalog.contact.productMessage, /\{producto\}.*\{formato\}/);
  assert.equal(validateCatalog(catalog).products.length, 27);
});

test("el catálogo Personas es independiente y está publicable", () => {
  const people = loadBundledCatalog("personas");
  assert.equal(people.meta.channel, "personas");
  assert.equal(people.meta.draft, false);
  assert.equal(people.meta.priceLabel, "Precio final");
  assert.match(people.meta.taxNote, /IVA incluido/);
  assert.ok(people.products.every(product => product.price === "Por definir"));
  assert.equal(normalizeCatalogChannel("personas"), "personas");
  assert.equal(normalizeCatalogChannel("desconocido"), "cafeterias");
});

test("la validación rechaza IDs duplicados y categorías inexistentes", () => {
  const duplicate = loadBundledCatalog();
  duplicate.products[1].id = duplicate.products[0].id;
  assert.throws(() => validateCatalog(duplicate), CatalogError);
  const missing = loadBundledCatalog();
  missing.products[0].category = "no-existe";
  assert.throws(() => validateCatalog(missing), CatalogError);
});
