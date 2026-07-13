import assert from "node:assert/strict";
import test from "node:test";
import { CatalogError, loadBundledCatalog, validateCatalog } from "../lib/catalog.js";

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

test("la validación rechaza IDs duplicados y categorías inexistentes", () => {
  const duplicate = loadBundledCatalog();
  duplicate.products[1].id = duplicate.products[0].id;
  assert.throws(() => validateCatalog(duplicate), CatalogError);
  const missing = loadBundledCatalog();
  missing.products[0].category = "no-existe";
  assert.throws(() => validateCatalog(missing), CatalogError);
});
