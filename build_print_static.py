#!/usr/bin/env python3
"""Construye el catálogo editorial A4 desde data/catalogo.json."""

from html import escape
from pathlib import Path
import json
import re
from urllib.parse import quote

try:
    from PIL import Image, ImageFilter, ImageOps
except ImportError:
    Image = ImageFilter = ImageOps = None

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "data/catalogo.json").read_text(encoding="utf-8"))
PRINT_IMAGE_DIR = ROOT / "assets/print"
TRANSPARENT_PRINT_DIR = ROOT / "assets/print-transparent"


def e(value):
    return escape(str(value or ""))


def whatsapp_href(message):
    base = DATA["contact"].get("whatsappUrl") or f"https://wa.me/{re.sub(r'\D', '', DATA['contact'].get('whatsapp') or DATA['contact']['phone'])}"
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}text={quote(message)}"


def editorial_title(value):
    """Destaca la última palabra sin dejar el texto atado a una frase fija."""
    text = str(value or "").strip()
    before, separator, last = text.rpartition(" ")
    if not separator:
        return f"<em>{e(text)}</em>"
    return f"{e(before)}<br><em>{e(last)}</em>"


def print_image(source_path):
    """Crea un JPEG liviano para mantener el PDF fácil de compartir."""
    if Image is None:
        return source_path
    source = ROOT / source_path
    if not source.is_file():
        return source_path
    PRINT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = PRINT_IMAGE_DIR / f"{source.stem}.jpg"
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return target.relative_to(ROOT).as_posix()
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((1100, 1100), Image.Resampling.LANCZOS)
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            background = Image.new("RGB", image.size, "#FCFBF8")
            rgba = image.convert("RGBA")
            background.paste(rgba.convert("RGB"), mask=rgba.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        image.save(target, "JPEG", quality=78, optimize=True, progressive=True)
    return target.relative_to(ROOT).as_posix()


def print_product_image(source_path):
    """Mantiene transparencia y limpia un píxel del halo del recorte."""
    if Image is None:
        return source_path
    source = ROOT / source_path
    if not source.is_file():
        return source_path
    with Image.open(source) as probe:
        has_alpha = probe.mode in ("RGBA", "LA") or "transparency" in probe.info
    if not has_alpha:
        return print_image(source_path)

    TRANSPARENT_PRINT_DIR.mkdir(parents=True, exist_ok=True)
    target = TRANSPARENT_PRINT_DIR / f"{source.stem}-edge-v4.png"
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return target.relative_to(ROOT).as_posix()
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGBA")
        image.thumbnail((600, 600), Image.Resampling.LANCZOS)
        alpha = image.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.25))
        image.putalpha(alpha)
        image.save(target, "PNG", optimize=True)
    return target.relative_to(ROOT).as_posix()


def build_clean_patterns():
    """Compone fondos de portada con recortes transparentes ya saneados."""
    if Image is None:
        fallback = "assets/images/cover-pattern-cookies.webp"
        return fallback, fallback

    sources = {
        "limon": "assets/images/tradicional-limon-amapola.webp",
        "brownie": "assets/images/tradicional-brownie.webp",
        "carrot": "assets/images/tradicional-carrot-cookie.webp",
        "nutella": "assets/images/tradicional-nutella.webp",
        "red": "assets/images/tradicional-red-velvet.webp",
        "pistacho": "assets/images/vegana-pistacho.webp",
    }

    def cookie(name, width, angle):
        with Image.open(ROOT / sources[name]) as source:
            item = ImageOps.exif_transpose(source).convert("RGBA")
            ratio = width / item.width
            item = item.resize((width, max(1, round(item.height * ratio))), Image.Resampling.LANCZOS)
            alpha = item.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.25))
            item.putalpha(alpha)
            return item.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

    def compose(size, placements, filename):
        canvas = Image.new("RGB", size, "#B6D2EF")
        for name, x, y, width, angle in placements:
            item = cookie(name, width, angle)
            canvas.paste(item, (x, y), item)
        target = PRINT_IMAGE_DIR / filename
        canvas.save(target, "JPEG", quality=84, optimize=True, progressive=True)
        return target.relative_to(ROOT).as_posix()

    PRINT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    horizontal = compose((2000, 1250), [
        ("red", -90, -110, 390, -8), ("limon", 430, -80, 420, 7),
        ("pistacho", 1050, 10, 390, -6), ("brownie", 1630, -70, 430, 9),
        ("carrot", 70, 430, 420, 5), ("nutella", 700, 410, 430, -8),
        ("red", 1370, 430, 380, 10), ("limon", 1750, 610, 400, -4),
        ("pistacho", -110, 900, 410, 7), ("brownie", 480, 860, 420, -9),
        ("carrot", 1110, 880, 410, 6), ("nutella", 1650, 930, 420, -5),
    ], "cover-pattern-clean-horizontal.jpg")
    vertical = compose((1600, 2400), [
        ("red", 930, -120, 560, 9), ("limon", -170, 180, 610, -7),
        ("pistacho", 710, 440, 560, 6), ("brownie", 80, 820, 590, -9),
        ("carrot", 930, 1040, 570, 8), ("nutella", -180, 1450, 590, 5),
        ("red", 820, 1730, 550, -8), ("limon", 120, 2070, 600, 7),
    ], "cover-pattern-clean-vertical.jpg")
    return horizontal, vertical


def category_color(category):
    color = str(category.get("color", "#B6D2EF"))
    return color if re.fullmatch(r"#[0-9a-fA-F]{6}", color) else "#B6D2EF"


def commercial_insert(value):
    text = str(value or "")
    return f"Relleno{text[len('Inserto'):]}" if text.lower().startswith("inserto") else text


def category_name(product):
    category = next((item for item in DATA["categories"] if item["id"] == product["category"]), None)
    return category.get("short", category["name"]) if category else product.get("eyebrow", "Producto Vestalia")


def products_in(*category_ids):
    return [product for product in DATA["products"] if product["category"] in category_ids]


def page_header(section, title, number, note=""):
    return f"""
      <header class="page-header">
        <div><p>{e(section)}</p><h1>{e(title)}</h1></div>
        {f'<span>{e(note)}</span>' if note else ''}
        <b>{number:02d}</b>
      </header>"""


def spread_product(product, compact=False):
    tags = "".join(f"<span>{e(tag)}</span>" for tag in product.get("tags", [])[:2])
    detail_title = "Descripción" if product.get("detailsLabel") == "Descripción comercial" else "Ingredientes"
    extra = commercial_insert(product.get("insert"))
    weight = f'<div><small>Peso</small><strong>{e(product["weight"])}</strong></div>' if product.get("weight") else ""
    return f"""
      <article class="spread-product {'compact' if compact else ''}" data-mode="{e(product.get('imageMode', 'contain'))}">
        <div class="spread-image"><img src="{e(print_product_image(product['image']))}" alt=""></div>
        <div class="spread-copy">
          <p class="spread-category">{e(category_name(product))}</p>
          <h2>{e(product['name'])}</h2>
          <div class="spread-tags">{tags}</div>
          <div class="spread-description"><h3>{detail_title}</h3><p>{e(product.get('ingredients'))}</p>{f'<strong>{e(extra)}</strong>' if extra else ''}</div>
          <div class="spread-meta">{weight}<div><small>Formato</small><strong>{e(product['format'])}</strong></div><div><small>Valor neto</small><strong>{e(product['price'])}</strong></div></div>
        </div>
      </article>"""


def category_tile(category):
    return f"""
      <aside class="category-tile">
        <img src="assets/brand/sello-circular.png" alt="">
        <p>{e(category.get('short', category['name']))}</p>
        <h2>{e(category.get('description', DATA['meta']['mantra']))}</h2>
        <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
      </aside>"""


def spread_page(category, products, number, trio=False, first=False):
    cards = "".join(spread_product(product, compact=trio) for product in products)
    if not products:
        cards = category_tile(category)
    elif len(products) == 1:
        cards += category_tile(category)
    subtitle = " · ".join(product["name"] for product in products) if products else category.get("description", "Colección Vestalia")
    anchor = f' id="category-{e(category["id"])}"' if first else ""
    return f"""
      <article{anchor} class="pdf-page spread-page {'trio-page' if trio else ''} {'single-page' if len(products) == 1 else ''} {'empty-category-page' if not products else ''}" style="--category-color:{category_color(category)}">
        {page_header('Colección Vestalia', category['name'], number, subtitle)}
        <div class="spread-layout">{cards}</div>
      </article>"""


def paginate_category(products):
    remaining = list(products)
    groups = []
    while len(remaining) > 3:
        groups.append((remaining[:2], False))
        remaining = remaining[2:]
    if remaining:
        groups.append((remaining, len(remaining) == 3))
    return groups


pattern_horizontal, pattern_vertical = build_clean_patterns()

active_categories = list(DATA["categories"])
index_chunks = [active_categories[index:index + 10] for index in range(0, len(active_categories), 10)] or [[]]

page_specs = []
category_pages = {}
next_page = 2 + len(index_chunks)
for category in active_categories:
    category_products = products_in(category["id"])
    category_pages[category["id"]] = next_page
    if not category_products:
        page_specs.append((category, [], next_page, False, True))
        next_page += 1
        continue
    for group_index, (group, trio) in enumerate(paginate_category(category_products)):
        page_specs.append((category, group, next_page, trio, group_index == 0))
        next_page += 1

price_chunks = [DATA["prices"][index:index + 9] for index in range(0, len(DATA["prices"]), 9)] or [[]]
faq_chunks = [DATA["faq"][index:index + 4] for index in range(0, len(DATA["faq"]), 4)] or [[]]
business_page_count = max(len(price_chunks), len(faq_chunks))
business_page_number = next_page
closing_page_number = business_page_number + business_page_count

pages = []

# 01 — Portada
pages.append(f"""
  <article class="pdf-page cover-page">
    <img class="cover-photo" src="{e(pattern_vertical)}" alt="">
    <div class="cover-panel">
      <img class="cover-logo" src="assets/brand/logo-principal.png" alt="Vestalia">
      <p>{e(DATA['meta']['subtitle'])}</p>
      <h1>{editorial_title(DATA['meta']['title'])}</h1>
      <span>{e(DATA['meta']['mantra'])}</span>
      <small>{e(DATA['meta']['edition'])}</small>
    </div>
    <div class="cover-rule"></div>
  </article>""")

# Introducción e índice. Al superar nueve categorías se crean páginas de índice adicionales.
for index_page, categories in enumerate(index_chunks):
    page_number = 2 + index_page
    category_index = "".join(
        f'<a href="#category-{e(category["id"])}"><span>{category_pages[category["id"]]:02d}</span><strong>{e(category["name"])}</strong><i>→</i></a>'
        for category in categories
    )
    if index_page == 0:
        intro_content = f"""
          <div class="intro-statement">
            <p>{e(DATA['meta'].get('introKicker', 'Una colección para hacer de lo cotidiano'))}</p>
            <h1>{editorial_title(DATA['meta'].get('introTitle', 'un pequeño ritual.'))}</h1>
          </div>
          <div class="intro-columns">
            <p>{e(DATA['meta']['intro'])}</p>
            <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
          </div>"""
    else:
        intro_content = f"""
          <div class="intro-statement index-heading">
            <p>Continuación</p>
            <h1>Índice de<br><em>categorías.</em></h1>
          </div>"""
    pages.append(f"""
      <article class="pdf-page intro-page {'index-continuation' if index_page else ''}">
        <div class="intro-top">
          <img src="assets/brand/isotipo.png" alt="">
          <p>{e(DATA['meta']['brand'])} · {e(DATA['meta']['title'])}</p>
          <span>{page_number:02d}</span>
        </div>
        {intro_content}
        <nav class="category-index" aria-label="Índice de categorías">{category_index}</nav>
        <div class="intro-bottom">
          <img src="{e(pattern_horizontal)}" alt="">
          <p>{e(DATA['meta'].get('introBottom', 'Tradición que se siente fresca.'))}</p>
        </div>
      </article>""")

# Colección dinámica: los encabezados y subtítulos se derivan siempre de los datos actuales.
for category, group, number, trio, first in page_specs:
    pages.append(spread_page(category, group, number, trio=trio, first=first))

# Condiciones, precios y conservación. Las tablas extensas continúan en páginas nuevas.
heating = "".join(f"<li>{e(item)}</li>" for item in DATA["storage"]["heating"])
conservation = "".join(f"<li>{e(item)}</li>" for item in DATA["storage"]["conservation"])
for business_index in range(business_page_count):
    current_prices = price_chunks[business_index] if business_index < len(price_chunks) else []
    current_faq = faq_chunks[business_index] if business_index < len(faq_chunks) else []
    price_rows = "".join(
        f'<div><strong>{e(row["product"])}</strong><span>{e(row["format"])}</span><b>{e(row["price"])}</b></div>'
        for row in current_prices
    )
    faq = "".join(f'<div><h3>{e(item["question"])}</h3><p>{e(item["answer"])}</p></div>' for item in current_faq)
    last_business_page = business_index == business_page_count - 1
    continuation = " · continuación" if business_index else ""
    care_band = f"""
      <div class="care-band">
        <div><p>Como recién horneadas</p><h2>{e(DATA['meta'].get('heatingTitle', 'Calienta con cuidado.'))}</h2><ul>{heating}</ul></div>
        <div><p>Conservación</p><h2>{e(DATA['meta'].get('conservationTitle', 'Guárdalas para después.'))}</h2><ul>{conservation}</ul></div>
        <img src="assets/brand/sello-circular.png" alt="">
      </div>""" if last_business_page else ""
    pages.append(f"""
      <article class="pdf-page business-page {'business-continuation' if not last_business_page else ''}">
        {page_header('Información comercial', DATA['meta'].get('businessTitle', 'Precios y servicio') + continuation, business_page_number + business_index, DATA['meta']['taxNote'])}
        <div class="business-columns">
          <div class="pdf-price-list">{price_rows}</div>
          <div class="pdf-faq">{faq}</div>
        </div>
        {care_band}
      </article>""")

# Cierre y contacto
pages.append(f"""
  <article class="pdf-page closing-page" id="contacto">
    <img class="closing-photo" src="{e(pattern_vertical)}" alt="">
    <div class="closing-panel">
      <img src="assets/brand/logo-principal.png" alt="Vestalia">
      <p>{e(DATA['meta'].get('contactEyebrow', 'Pedidos para cafeterías'))}</p>
      <h1>{editorial_title(DATA['meta'].get('contactTitle', '¿Qué ponemos en tu vitrina?'))}</h1>
      <span>{e(DATA['meta'].get('contactText', 'Consulta sabores, disponibilidad y coordinación de despacho.'))}</span>
      <div class="closing-contact">
        <a href="{e(whatsapp_href(DATA['contact'].get('genericMessage') or 'Hola Vestalia, quisiera información para mi cafetería.'))}">WhatsApp · {e(DATA['contact'].get('whatsapp') or DATA['contact']['phone'])}</a>
        <a href="{e(DATA['contact'].get('instagramUrl', ''))}">{e(DATA['contact']['instagram'])}</a>
        <a href="{e(DATA['contact'].get('phoneUrl', ''))}">{e(DATA['contact']['phone'])}</a>
        <a href="{e(DATA['contact'].get('emailUrl', ''))}">{e(DATA['contact']['email'])}</a>
      </div>
      <blockquote>{e(DATA['meta']['mantra'])}</blockquote>
    </div>
  </article>""")

html = f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(DATA['meta']['brand'])} — {e(DATA['meta']['title'])}</title>
  <link rel="stylesheet" href="print.css">
  <link rel="stylesheet" href="weasyprint.css">
</head>
<body class="print-document">
  <main id="print-catalog">{''.join(pages)}</main>
</body>
</html>"""

output = ROOT / "print-static.html"
output.write_text(html, encoding="utf-8")
print(output)
