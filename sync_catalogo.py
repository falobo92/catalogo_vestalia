#!/usr/bin/env python3
"""Valida el catálogo maestro y genera el fallback JavaScript para uso sin servidor."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
JSON_PATH = DATA_DIR / "catalogo.json"
JS_PATH = DATA_DIR / "catalog-data.js"


class CatalogError(ValueError):
    pass


def validate_catalog(catalog: Any) -> dict[str, Any]:
    if not isinstance(catalog, dict):
        raise CatalogError("El catálogo debe ser un objeto JSON.")
    required_sections = ("meta", "categories", "products", "prices", "faq", "storage", "contact")
    missing = [key for key in required_sections if key not in catalog]
    if missing:
        raise CatalogError(f"Faltan secciones obligatorias: {', '.join(missing)}.")
    if not isinstance(catalog["meta"], dict):
        raise CatalogError("La sección meta debe ser un objeto.")
    missing_meta = [key for key in ("brand", "title", "subtitle", "mantra", "edition", "taxNote", "intro") if not str(catalog["meta"].get(key, "")).strip()]
    if missing_meta:
        raise CatalogError(f"Faltan textos generales: {', '.join(missing_meta)}.")
    if not isinstance(catalog["categories"], list) or not catalog["categories"]:
        raise CatalogError("Debe existir al menos una categoría.")
    if not isinstance(catalog["products"], list):
        raise CatalogError("La sección products debe ser una lista.")
    if not isinstance(catalog["prices"], list):
        raise CatalogError("La sección prices debe ser una lista.")
    if not isinstance(catalog["faq"], list):
        raise CatalogError("La sección faq debe ser una lista.")
    if not isinstance(catalog["storage"], dict):
        raise CatalogError("La sección storage debe ser un objeto.")
    if not isinstance(catalog["contact"], dict):
        raise CatalogError("La sección contact debe ser un objeto.")

    category_ids: set[str] = set()
    for index, category in enumerate(catalog["categories"], start=1):
        if not isinstance(category, dict) or not category.get("id") or not category.get("name") or not category.get("short"):
            raise CatalogError(f"La categoría {index} necesita id, name y short.")
        if not re.fullmatch(r"[a-z0-9-]+", str(category["id"])):
            raise CatalogError(f"ID de categoría inválido: {category['id']}.")
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", str(category.get("color", ""))):
            raise CatalogError(f"La categoría {category['name']} necesita un color hexadecimal como #B6D2EF.")
        if category["id"] in category_ids:
            raise CatalogError(f"ID de categoría duplicado: {category['id']}.")
        category_ids.add(category["id"])

    product_ids: set[str] = set()
    required_product_fields = ("id", "category", "name", "image", "format", "price")
    for index, product in enumerate(catalog["products"], start=1):
        if not isinstance(product, dict):
            raise CatalogError(f"El producto {index} no es un objeto válido.")
        absent = [key for key in required_product_fields if not str(product.get(key, "")).strip()]
        if absent:
            raise CatalogError(f"El producto {index} necesita: {', '.join(absent)}.")
        if product["id"] in product_ids:
            raise CatalogError(f"ID de producto duplicado: {product['id']}.")
        if product["category"] not in category_ids:
            raise CatalogError(f"{product['name']} usa una categoría inexistente: {product['category']}.")
        if not isinstance(product.get("tags", []), list):
            raise CatalogError(f"Las etiquetas de {product['name']} deben ser una lista.")
        product_ids.add(product["id"])
    for index, row in enumerate(catalog["prices"], start=1):
        if not isinstance(row, dict) or not row.get("product") or not row.get("format") or not row.get("price"):
            raise CatalogError(f"La fila de precios {index} necesita product, format y price.")
        if row.get("category") and row["category"] not in category_ids:
            raise CatalogError(f"La fila de precios {index} usa una categoría inexistente: {row['category']}.")
    for index, row in enumerate(catalog["faq"], start=1):
        if not isinstance(row, dict) or not str(row.get("question", "")).strip() or not str(row.get("answer", "")).strip():
            raise CatalogError(f"La pregunta de servicio {index} necesita question y answer.")
    if not isinstance(catalog["storage"].get("heating"), list) or not isinstance(catalog["storage"].get("conservation"), list):
        raise CatalogError("Conservación necesita listas heating y conservation.")
    if not str(catalog["storage"].get("note", "")).strip():
        raise CatalogError("Conservación necesita una nota principal.")
    for key in ("instagram", "phone", "whatsapp", "email"):
        if not str(catalog["contact"].get(key, "")).strip():
            raise CatalogError(f"Contacto necesita el campo {key}.")
    return catalog


def load_catalog() -> dict[str, Any]:
    try:
        catalog = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CatalogError(f"No se pudo leer {JSON_PATH.name}: {error}") from error
    return validate_catalog(catalog)


def write_catalog(catalog: dict[str, Any]) -> None:
    validate_catalog(catalog)
    serialized = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    temporary = JSON_PATH.with_suffix(".json.tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(JSON_PATH)
    write_js_fallback(catalog)


def write_js_fallback(catalog: dict[str, Any]) -> None:
    serialized = json.dumps(catalog, ensure_ascii=False, indent=2)
    content = (
        "// Archivo generado desde data/catalogo.json. No editar manualmente.\n"
        f"window.VESTALIA_DATA = {serialized};\n"
    )
    temporary = JS_PATH.with_suffix(".js.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(JS_PATH)


if __name__ == "__main__":
    current = load_catalog()
    write_js_fallback(current)
    print(f"Catálogo validado: {len(current['products'])} productos. Fallback actualizado: {JS_PATH}")
