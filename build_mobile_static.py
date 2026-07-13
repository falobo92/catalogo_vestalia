#!/usr/bin/env python3
"""Construye la edición 9:16 del catálogo para lectura en teléfonos."""

from html import escape
from pathlib import Path
from urllib.parse import quote
import json
import re

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "data/catalogo.json").read_text(encoding="utf-8"))


def e(value):
    return escape(str(value or ""), quote=True)


def editorial_title(value):
    text = str(value or "").strip()
    before, separator, last = text.rpartition(" ")
    return f"{e(before)}<br><em>{e(last)}</em>" if separator else f"<em>{e(text)}</em>"


def category_color(category):
    value = str(category.get("color", "#B6D2EF"))
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value) else "#B6D2EF"


def product_image(product):
    source = Path(product["image"])
    if product.get("imageMode") == "cover":
        candidate = Path("assets/print") / f"{source.stem}.jpg"
    else:
        candidate = Path("assets/print-transparent") / f"{source.stem}-edge-v4.png"
    return candidate.as_posix() if (ROOT / candidate).is_file() else source.as_posix()


def chunks(items, size):
    return [items[index:index + size] for index in range(0, len(items), size)] or [[]]


def page_header(label, title, number):
    return f"""
      <header class="mobile-header">
        <div><p>{e(label)}</p><h1>{e(title)}</h1></div>
        <b>{number:02d}</b>
      </header>"""


categories = {category["id"]: category for category in DATA["categories"]}
active_categories = list(DATA["categories"])
index_chunks = chunks(active_categories, 10)
product_start = 2 + len(index_chunks)
category_pages = {}
product_pages = []
next_page = product_start

for category in active_categories:
    category_products = [product for product in DATA["products"] if product["category"] == category["id"]]
    category_pages[category["id"]] = next_page
    if not category_products:
        product_pages.append((None, category, next_page, True))
        next_page += 1
        continue
    for product_index, product in enumerate(category_products):
        product_pages.append((product, category, next_page, product_index == 0))
        next_page += 1

price_chunks = chunks(DATA["prices"], 9)
price_start = next_page
next_page += len(price_chunks)
faq_chunks = chunks(DATA["faq"], 4)
service_start = next_page
next_page += len(faq_chunks)
contact_page = next_page

pattern = "assets/print/cover-pattern-clean-vertical.jpg"
if not (ROOT / pattern).is_file():
    pattern = "assets/images/cover-pattern-cookies.webp"

pages = []

pages.append(f"""
  <article class="mobile-page mobile-cover">
    <img class="cover-pattern" src="{e(pattern)}" alt="">
    <div class="cover-copy">
      <img src="assets/brand/logo-principal.png" alt="Vestalia">
      <p>{e(DATA['meta']['subtitle'])}</p>
      <h1>{editorial_title(DATA['meta']['title'])}</h1>
      <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
      <small>{e(DATA['meta']['edition'])} · Edición móvil</small>
    </div>
  </article>""")

for index, category_group in enumerate(index_chunks):
    number = 2 + index
    links = "".join(
        f'<a href="#mobile-category-{e(category["id"])}"><span>{category_pages[category["id"]]:02d}</span><strong>{e(category["name"])}</strong><i>→</i></a>'
        for category in category_group
    )
    intro_summary = DATA["meta"]["intro"].split(".", 1)[0].strip() + "."
    intro = f'<p class="index-intro">{e(intro_summary)}</p>' if index == 0 else '<p class="index-intro">Continuación del índice de productos.</p>'
    pages.append(f"""
      <article class="mobile-page mobile-index">
        {page_header(DATA['meta']['brand'], 'Índice de productos', number)}
        <div class="index-title"><p>{e(DATA['meta'].get('introKicker', 'Una colección para cafeterías'))}</p><h2>Elige una<br><em>categoría.</em></h2></div>
        {intro}
        <nav class="mobile-index-list" aria-label="Índice de categorías">{links}</nav>
        <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
      </article>""")

whatsapp_base = DATA["contact"].get("whatsappUrl") or f"https://wa.me/{re.sub(r'\D', '', DATA['contact'].get('whatsapp') or DATA['contact']['phone'])}"

for product, category, number, first in product_pages:
    if product is None:
        pages.append(f"""
          <article id="mobile-category-{e(category['id'])}" class="mobile-page mobile-empty-category" style="--category-color:{category_color(category)}">
            {page_header('Colección Vestalia', category['name'], number)}
            <div class="mobile-empty-copy">
              <img src="assets/brand/sello-circular.png" alt="">
              <p>{e(category.get('short', category['name']))}</p>
              <h2>{e(category.get('description', DATA['meta']['mantra']))}</h2>
              <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
            </div>
          </article>""")
        continue
    tags = "".join(f"<span>{e(tag)}</span>" for tag in product.get("tags", [])[:2])
    weight = f'<div><small>Peso</small><strong>{e(product["weight"])}</strong></div>' if product.get("weight") else ""
    extra = str(product.get("insert") or "")
    if extra.lower().startswith("inserto"):
        extra = f"Relleno{extra[len('Inserto'):]}"
    detail_title = "Descripción" if product.get("detailsLabel") == "Descripción comercial" else "Ingredientes"
    separator = "&" if "?" in whatsapp_base else "?"
    message = quote(f"Hola Vestalia, quisiera consultar por {product['name']} ({product['format']}).")
    anchor = f' id="mobile-category-{e(category["id"])}"' if first else ""
    pages.append(f"""
      <article{anchor} class="mobile-page mobile-product" style="--category-color:{category_color(category)}" data-mode="{e(product.get('imageMode', 'contain'))}">
        {page_header(category.get('short', category['name']), product['name'], number)}
        <div class="mobile-product-image"><img src="{e(product_image(product))}" alt="{e(product['name'])}" style="object-position:{e(product.get('imagePosition', 'center center'))}"></div>
        <div class="mobile-product-copy">
          <div class="mobile-tags">{tags}</div>
          <div class="mobile-description"><h2>{detail_title}</h2><p>{e(product.get('ingredients'))}</p>{f'<strong>{e(extra)}</strong>' if extra else ''}</div>
          <div class="mobile-meta">{weight}<div><small>Formato</small><strong>{e(product['format'])}</strong></div><div><small>Valor neto</small><strong>{e(product['price'])}</strong></div></div>
          <a class="mobile-whatsapp" href="{e(whatsapp_base + separator + 'text=' + message)}">Consultar por WhatsApp <span>↗</span></a>
        </div>
      </article>""")

for index, price_group in enumerate(price_chunks):
    number = price_start + index
    rows = "".join(f'<div><strong>{e(row["product"])}</strong><span>{e(row["format"])}</span><b>{e(row["price"])}</b></div>' for row in price_group)
    pages.append(f"""
      <article class="mobile-page mobile-prices">
        {page_header('Información comercial', DATA['meta'].get('businessTitle', 'Precios y servicio'), number)}
        <div class="mobile-price-intro"><p>Valores y formatos</p><h2>Una propuesta clara<br>para tu <em>vitrina.</em></h2></div>
        <div class="mobile-price-list">{rows}</div>
        <p class="mobile-tax">{e(DATA['meta']['taxNote'])}</p>
      </article>""")

heating = "".join(f"<li>{e(item)}</li>" for item in DATA["storage"]["heating"])
conservation = "".join(f"<li>{e(item)}</li>" for item in DATA["storage"]["conservation"])
for index, faq_group in enumerate(faq_chunks):
    number = service_start + index
    faq = "".join(f'<section><h3>{e(item["question"])}</h3><p>{e(item["answer"])}</p></section>' for item in faq_group)
    is_last = index == len(faq_chunks) - 1
    care = f"""
      <div class="mobile-care">
        <div><h3>{e(DATA['meta'].get('heatingTitle', 'Calienta con cuidado.'))}</h3><ul>{heating}</ul></div>
        <div><h3>{e(DATA['meta'].get('conservationTitle', 'Guárdalas para después.'))}</h3><ul>{conservation}</ul></div>
      </div>""" if is_last else ""
    pages.append(f"""
      <article class="mobile-page mobile-service {'with-care' if is_last else ''}">
        {page_header('Servicio', 'Preguntas frecuentes', number)}
        <div class="mobile-faq">{faq}</div>
        {care}
      </article>""")

pages.append(f"""
  <article class="mobile-page mobile-contact">
    <img class="contact-pattern" src="{e(pattern)}" alt="">
    <div class="contact-copy">
      <img src="assets/brand/logo-principal.png" alt="Vestalia">
      <p>{e(DATA['meta'].get('contactEyebrow', 'Pedidos para cafeterías'))}</p>
      <h1>{editorial_title(DATA['meta'].get('contactTitle', '¿Qué ponemos en tu vitrina?'))}</h1>
      <span>{e(DATA['meta'].get('contactText', 'Consulta sabores y disponibilidad.'))}</span>
      <div>
        <a href="{e(whatsapp_base)}">WhatsApp · {e(DATA['contact'].get('whatsapp') or DATA['contact']['phone'])}</a>
        <a href="{e(DATA['contact'].get('instagramUrl'))}">{e(DATA['contact']['instagram'])}</a>
        <a href="{e(DATA['contact'].get('emailUrl'))}">{e(DATA['contact']['email'])}</a>
      </div>
      <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
      <b>{contact_page:02d}</b>
    </div>
  </article>""")

html = f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(DATA['meta']['brand'])} — {e(DATA['meta']['title'])} móvil</title>
  <link rel="stylesheet" href="mobile-print.css">
</head>
<body class="mobile-document"><main>{''.join(pages)}</main></body>
</html>"""

output = ROOT / "mobile-print-static.html"
output.write_text(html, encoding="utf-8")
print(output)
