import fs from "node:fs";
import path from "node:path";

export class CatalogError extends Error {}

const ID_PATTERN = /^[a-z0-9-]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function validateCatalog(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CatalogError("El catálogo debe ser un objeto JSON.");
  }
  const requiredSections = ["meta", "categories", "products", "prices", "faq", "storage", "contact"];
  const missing = requiredSections.filter(key => !(key in input));
  if (missing.length) throw new CatalogError(`Faltan secciones obligatorias: ${missing.join(", ")}.`);
  if (!input.meta || typeof input.meta !== "object" || Array.isArray(input.meta)) throw new CatalogError("La sección meta debe ser un objeto.");
  if (!Array.isArray(input.categories) || !input.categories.length) throw new CatalogError("Debe existir al menos una categoría.");
  if (!Array.isArray(input.products)) throw new CatalogError("La sección products debe ser una lista.");
  if (!Array.isArray(input.prices)) throw new CatalogError("La sección prices debe ser una lista.");
  if (!Array.isArray(input.faq)) throw new CatalogError("La sección faq debe ser una lista.");
  if (!input.storage || typeof input.storage !== "object" || Array.isArray(input.storage)) throw new CatalogError("La sección storage debe ser un objeto.");
  if (!input.contact || typeof input.contact !== "object" || Array.isArray(input.contact)) throw new CatalogError("La sección contact debe ser un objeto.");

  const categoryIds = new Set();
  input.categories.forEach((category, index) => {
    if (!category || typeof category !== "object" || !category.id || !category.name || !category.short) {
      throw new CatalogError(`La categoría ${index} necesita id, name y short.`);
    }
    if (!ID_PATTERN.test(category.id)) throw new CatalogError(`ID de categoría inválido: ${category.id}.`);
    if (!COLOR_PATTERN.test(category.color || "")) throw new CatalogError(`La categoría ${category.name} necesita un color hexadecimal como #B6D2EF.`);
    if (categoryIds.has(category.id)) throw new CatalogError(`ID de categoría duplicado: ${category.id}.`);
    categoryIds.add(category.id);
  });

  const productIds = new Set();
  input.products.forEach((product, index) => {
    if (!product || typeof product !== "object") throw new CatalogError(`El producto ${index} no es un objeto válido.`);
    const absent = ["id", "category", "name", "image", "format", "price"].filter(key => !String(product[key] || "").trim());
    if (absent.length) throw new CatalogError(`El producto ${index} necesita: ${absent.join(", ")}.`);
    if (!ID_PATTERN.test(product.id)) throw new CatalogError(`ID de producto inválido: ${product.id}.`);
    if (productIds.has(product.id)) throw new CatalogError(`ID de producto duplicado: ${product.id}.`);
    if (!categoryIds.has(product.category)) throw new CatalogError(`${product.name} usa una categoría inexistente: ${product.category}.`);
    if (!Array.isArray(product.tags || [])) throw new CatalogError(`Las etiquetas de ${product.name} deben ser una lista.`);
    productIds.add(product.id);
  });

  input.prices.forEach((row, index) => {
    if (!row?.product || !row?.format || !row?.price) throw new CatalogError(`La fila de precios ${index} necesita product, format y price.`);
    if (row.category && !categoryIds.has(row.category)) throw new CatalogError(`La fila de precios ${index} usa una categoría inexistente: ${row.category}.`);
  });
  input.faq.forEach((item, index) => {
    if (!item?.question || !item?.answer) throw new CatalogError(`La pregunta de servicio ${index} necesita question y answer.`);
  });
  if (!Array.isArray(input.storage.heating) || !Array.isArray(input.storage.conservation)) throw new CatalogError("Conservación necesita listas heating y conservation.");
  if (!input.storage.note) throw new CatalogError("Conservación necesita una nota principal.");
  for (const key of ["phone", "instagram", "email"]) {
    if (!input.contact[key]) throw new CatalogError(`Contacto necesita el campo ${key}.`);
  }
  return structuredClone(input);
}

export function loadBundledCatalog() {
  const filename = path.join(process.cwd(), "data", "catalogo.json");
  return validateCatalog(JSON.parse(fs.readFileSync(filename, "utf8")));
}

