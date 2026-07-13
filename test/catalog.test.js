import assert from "node:assert/strict";
import test from "node:test";
import { CatalogError, loadBundledCatalog, validateCatalog } from "../lib/catalog.js";

test("el catálogo incluido contiene la colección completa", () => {
  const catalog = loadBundledCatalog();
  assert.equal(catalog.products.length, 27);
  assert.equal(catalog.categories.length, 9);
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
