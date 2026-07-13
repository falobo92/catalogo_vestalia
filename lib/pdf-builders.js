import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_URI_CACHE = new Map();

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function localDataUri(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized.startsWith("assets/") || normalized.includes("..")) return relativePath;
  if (DATA_URI_CACHE.has(normalized)) return DATA_URI_CACHE.get(normalized);
  const absolute = path.join(ROOT, ...normalized.split("/"));
  if (!fs.existsSync(absolute)) return relativePath;
  const mime = MIME_TYPES[path.extname(normalized).toLowerCase()] || "application/octet-stream";
  const uri = `data:${mime};base64,${fs.readFileSync(absolute).toString("base64")}`;
  DATA_URI_CACHE.set(normalized, uri);
  return uri;
}

function embedLocalAssets(value) {
  return String(value)
    .replace(/(src=["'])(assets\/[^"']+)(["'])/g, (_, open, source, close) => `${open}${localDataUri(source)}${close}`)
    .replace(/url\((["']?)(assets\/[^)'\"]+)\1\)/g, (_, __, source) => `url("${localDataUri(source)}")`);
}

function e(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function whatsappBase(contact = {}) {
  const digits = String(contact.whatsapp || contact.phone || "").replace(/\D/g, "");
  return contact.whatsappUrl || `https://wa.me/${digits}`;
}

function whatsappHref(contact, message) {
  const base = whatsappBase(contact);
  return `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`;
}

function productWhatsappMessage(contact, product) {
  const template = contact.productMessage || "Hola Vestalia, quisiera consultar por {producto} ({formato}).";
  return template.replaceAll("{producto}", product.name).replaceAll("{formato}", product.format);
}

function editorialTitle(value) {
  const text = String(value || "").trim();
  const split = text.lastIndexOf(" ");
  return split < 0 ? `<em>${e(text)}</em>` : `${e(text.slice(0, split))}<br><em>${e(text.slice(split + 1))}</em>`;
}

function color(category) {
  return /^#[0-9a-f]{6}$/i.test(category?.color || "") ? category.color : "#B6D2EF";
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result.length ? result : [[]];
}

function localProductImage(product) {
  const source = String(product.image || "");
  if (/^https?:\/\//i.test(source)) return source;
  const parsed = path.posix.parse(source.replaceAll("\\", "/"));
  const candidate = product.imageMode === "cover"
    ? `assets/print/${parsed.name}.jpg`
    : `assets/print-transparent/${parsed.name}-edge-v4.png`;
  return fs.existsSync(path.join(ROOT, ...candidate.split("/"))) ? candidate : source;
}

function header(className, label, title, number, note = "") {
  return `<header class="${className}"><div><p>${e(label)}</p><h1>${e(title)}</h1></div>${note ? `<span>${e(note)}</span>` : ""}<b>${String(number).padStart(2, "0")}</b></header>`;
}

function documentHtml(title, cssFiles, body, origin, bodyClass = "") {
  const styles = embedLocalAssets(cssFiles.map(file => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n"));
  const base = `${String(origin || "http://127.0.0.1:8080").replace(/\/$/, "")}/`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="${e(base)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>${styles}</style></head><body class="${e(bodyClass)}">${embedLocalAssets(body)}</body></html>`;
}

function categoryName(catalog, product) {
  const category = catalog.categories.find(item => item.id === product.category);
  return category ? (category.short || category.name) : (product.eyebrow || "Producto Vestalia");
}

function productCard(catalog, product, compact = false) {
  const tags = (product.tags || []).slice(0, 2).map(tag => `<span>${e(tag)}</span>`).join("");
  const detailTitle = product.detailsLabel === "Descripción comercial" ? "Descripción" : "Ingredientes";
  const originalExtra = String(product.insert || "");
  const extra = originalExtra.toLowerCase().startsWith("inserto") ? `Relleno${originalExtra.slice(7)}` : originalExtra;
  const weight = product.weight ? `<div><small>Peso</small><strong>${e(product.weight)}</strong></div>` : "";
  return `<article class="spread-product ${compact ? "compact" : ""}" data-mode="${e(product.imageMode || "contain")}">
    <div class="spread-image"><img src="${e(localProductImage(product))}" alt=""></div>
    <div class="spread-copy"><p class="spread-category">${e(categoryName(catalog, product))}</p><h2>${e(product.name)}</h2>
    <div class="spread-tags">${tags}</div><div class="spread-description"><h3>${detailTitle}</h3><p>${e(product.ingredients)}</p>${extra ? `<strong>${e(extra)}</strong>` : ""}</div>
    <div class="spread-meta">${weight}<div><small>Formato</small><strong>${e(product.format)}</strong></div><div><small>${e(catalog.meta.priceLabel || "Valor neto")}</small><strong>${e(product.price)}</strong></div></div></div></article>`;
}

function categoryTile(catalog, category) {
  return `<aside class="category-tile"><img src="assets/brand/sello-circular.png" alt=""><p>${e(category.short || category.name)}</p><h2>${e(category.description || catalog.meta.mantra)}</h2><blockquote>${e(catalog.meta.mantra)}</blockquote></aside>`;
}

export function buildA4Html(catalog, origin) {
  const meta = catalog.meta;
  const categories = [...catalog.categories];
  const indexChunks = chunks(categories, 10);
  const specs = [];
  const categoryPages = new Map();
  let nextPage = 2 + indexChunks.length;
  for (const category of categories) {
    const products = catalog.products.filter(product => product.category === category.id);
    categoryPages.set(category.id, nextPage);
    if (!products.length) {
      specs.push({ category, products: [], number: nextPage++, trio: false, first: true });
      continue;
    }
    const groups = [];
    const remaining = [...products];
    while (remaining.length > 3) groups.push({ products: remaining.splice(0, 2), trio: false });
    if (remaining.length) groups.push({ products: remaining, trio: remaining.length === 3 });
    groups.forEach((group, index) => specs.push({ category, ...group, number: nextPage++, first: index === 0 }));
  }

  const priceChunks = chunks(catalog.prices, 9);
  const faqChunks = chunks(catalog.faq, 4);
  const businessCount = Math.max(priceChunks.length, faqChunks.length);
  const businessStart = nextPage;
  const pages = [];
  const vertical = "assets/print/cover-pattern-clean-vertical.jpg";
  const horizontal = "assets/print/cover-pattern-clean-horizontal.jpg";

  pages.push(`<article class="pdf-page cover-page"><img class="cover-photo" src="${vertical}" alt=""><div class="cover-panel"><img class="cover-logo" src="assets/brand/logo-principal.png" alt="Vestalia"><p>${e(meta.subtitle)}</p><h1>${editorialTitle(meta.title)}</h1><span>${e(meta.mantra)}</span><small>${e(meta.edition)}</small></div><div class="cover-rule"></div></article>`);

  indexChunks.forEach((group, index) => {
    const number = 2 + index;
    const links = group.map(category => `<a href="#category-${e(category.id)}"><span>${String(categoryPages.get(category.id)).padStart(2, "0")}</span><strong>${e(category.name)}</strong><i>→</i></a>`).join("");
    const intro = index === 0
      ? `<div class="intro-statement"><p>${e(meta.introKicker || "Una colección para hacer de lo cotidiano")}</p><h1>${editorialTitle(meta.introTitle || "un pequeño ritual.")}</h1></div><div class="intro-columns"><p>${e(meta.intro)}</p><blockquote>${e(meta.mantra)}</blockquote></div>`
      : `<div class="intro-statement index-heading"><p>Continuación</p><h1>Índice de<br><em>categorías.</em></h1></div>`;
    pages.push(`<article class="pdf-page intro-page ${index ? "index-continuation" : ""}"><div class="intro-top"><img src="assets/brand/isotipo.png" alt=""><p>${e(meta.brand)} · ${e(meta.title)}</p><span>${String(number).padStart(2, "0")}</span></div>${intro}<nav class="category-index">${links}</nav><div class="intro-bottom"><img src="${horizontal}" alt=""><p>${e(meta.introBottom || "Tradición que se siente fresca.")}</p></div></article>`);
  });

  for (const spec of specs) {
    let cards = spec.products.map(product => productCard(catalog, product, spec.trio)).join("");
    if (!spec.products.length) cards = categoryTile(catalog, spec.category);
    else if (spec.products.length === 1) cards += categoryTile(catalog, spec.category);
    const subtitle = spec.products.length ? spec.products.map(product => product.name).join(" · ") : (spec.category.description || "Colección Vestalia");
    pages.push(`<article${spec.first ? ` id="category-${e(spec.category.id)}"` : ""} class="pdf-page spread-page ${spec.trio ? "trio-page" : ""} ${spec.products.length === 1 ? "single-page" : ""} ${!spec.products.length ? "empty-category-page" : ""}" style="--category-color:${color(spec.category)}">${header("page-header", "Colección Vestalia", spec.category.name, spec.number, subtitle)}<div class="spread-layout">${cards}</div></article>`);
  }

  const heating = catalog.storage.heating.map(item => `<li>${e(item)}</li>`).join("");
  const conservation = catalog.storage.conservation.map(item => `<li>${e(item)}</li>`).join("");
  for (let index = 0; index < businessCount; index += 1) {
    const priceRows = (priceChunks[index] || []).map(row => `<div><strong>${e(row.product)}</strong><span>${e(row.format)}</span><b>${e(row.price)}</b></div>`).join("");
    const faq = (faqChunks[index] || []).map(item => `<div><h3>${e(item.question)}</h3><p>${e(item.answer)}</p></div>`).join("");
    const last = index === businessCount - 1;
    const care = last ? `<div class="care-band"><div><p>Como recién horneadas</p><h2>${e(meta.heatingTitle || "Calienta con cuidado.")}</h2><ul>${heating}</ul></div><div><p>Conservación</p><h2>${e(meta.conservationTitle || "Guárdalas para después.")}</h2><ul>${conservation}</ul></div><img src="assets/brand/sello-circular.png" alt=""></div>` : "";
    pages.push(`<article class="pdf-page business-page ${last ? "" : "business-continuation"}">${header("page-header", "Información comercial", `${meta.businessTitle || "Precios y servicio"}${index ? " · continuación" : ""}`, businessStart + index, meta.taxNote)}<div class="business-columns"><div class="pdf-price-list">${priceRows}</div><div class="pdf-faq">${faq}</div></div>${care}</article>`);
  }

  const genericMessage = catalog.contact.genericMessage || "Hola Vestalia, quisiera información para mi cafetería.";
  pages.push(`<article class="pdf-page closing-page" id="contacto"><img class="closing-photo" src="${vertical}" alt=""><div class="closing-panel"><img src="assets/brand/logo-principal.png" alt="Vestalia"><p>${e(meta.contactEyebrow || "Pedidos para cafeterías")}</p><h1>${editorialTitle(meta.contactTitle || "¿Qué ponemos en tu vitrina?")}</h1><span>${e(meta.contactText || "Consulta sabores, disponibilidad y coordinación de despacho.")}</span><div class="closing-contact"><a href="${e(whatsappHref(catalog.contact, genericMessage))}">WhatsApp · ${e(catalog.contact.whatsapp || catalog.contact.phone)}</a><a href="${e(catalog.contact.instagramUrl)}">${e(catalog.contact.instagram)}</a><a href="${e(catalog.contact.phoneUrl)}">${e(catalog.contact.phone)}</a><a href="${e(catalog.contact.emailUrl)}">${e(catalog.contact.email)}</a></div><blockquote>${e(meta.mantra)}</blockquote></div></article>`);
  const documentClass = `print-document${meta.theme === "personas" ? " personas-document" : ""}`;
  return { html: documentHtml(`${meta.brand} — ${meta.title}`, ["print.css", "weasyprint.css"], `<main id="print-catalog">${pages.join("")}</main>`, origin, documentClass), pageCount: pages.length };
}

export function buildMobileHtml(catalog, origin) {
  const meta = catalog.meta;
  const categories = [...catalog.categories];
  const indexChunks = chunks(categories, 10);
  const categoryPages = new Map();
  const productPages = [];
  let nextPage = 2 + indexChunks.length;
  for (const category of categories) {
    const products = catalog.products.filter(product => product.category === category.id);
    categoryPages.set(category.id, nextPage);
    if (!products.length) productPages.push({ product: null, category, number: nextPage++, first: true });
    products.forEach((product, index) => productPages.push({ product, category, number: nextPage++, first: index === 0 }));
  }
  const priceChunks = chunks(catalog.prices, 9);
  const priceStart = nextPage;
  nextPage += priceChunks.length;
  const faqChunks = chunks(catalog.faq, 4);
  const serviceStart = nextPage;
  nextPage += faqChunks.length;
  const contactPage = nextPage;
  const pattern = fs.existsSync(path.join(ROOT, "assets", "print", "cover-pattern-clean-vertical.jpg")) ? "assets/print/cover-pattern-clean-vertical.jpg" : "assets/images/cover-pattern-cookies.webp";
  const pages = [];
  pages.push(`<article class="mobile-page mobile-cover"><img class="cover-pattern" src="${pattern}" alt=""><div class="cover-copy"><img src="assets/brand/logo-principal.png" alt="Vestalia"><p>${e(meta.subtitle)}</p><h1>${editorialTitle(meta.title)}</h1><blockquote>${e(meta.mantra)}</blockquote><small>${e(meta.edition)} · Edición móvil</small></div></article>`);
  indexChunks.forEach((group, index) => {
    const links = group.map(category => `<a href="#mobile-category-${e(category.id)}"><span>${String(categoryPages.get(category.id)).padStart(2, "0")}</span><strong>${e(category.name)}</strong><i>→</i></a>`).join("");
    const summary = index === 0 ? `${String(meta.intro || "").split(".", 1)[0].trim()}.` : "Continuación del índice de productos.";
    pages.push(`<article class="mobile-page mobile-index">${header("mobile-header", meta.brand, "Índice de productos", 2 + index)}<div class="index-title"><p>${e(meta.introKicker || "Una colección para cafeterías")}</p><h2>Elige una<br><em>categoría.</em></h2></div><p class="index-intro">${e(summary)}</p><nav class="mobile-index-list">${links}</nav><blockquote>${e(meta.mantra)}</blockquote></article>`);
  });

  const genericMessage = catalog.contact.genericMessage || "Hola Vestalia, quisiera información para mi cafetería.";
  const genericWhatsapp = whatsappHref(catalog.contact, genericMessage);
  for (const spec of productPages) {
    if (!spec.product) {
      pages.push(`<article id="mobile-category-${e(spec.category.id)}" class="mobile-page mobile-empty-category" style="--category-color:${color(spec.category)}">${header("mobile-header", "Colección Vestalia", spec.category.name, spec.number)}<div class="mobile-empty-copy"><img src="assets/brand/sello-circular.png" alt=""><p>${e(spec.category.short || spec.category.name)}</p><h2>${e(spec.category.description || meta.mantra)}</h2><blockquote>${e(meta.mantra)}</blockquote></div></article>`);
      continue;
    }
    const product = spec.product;
    const tags = (product.tags || []).slice(0, 2).map(tag => `<span>${e(tag)}</span>`).join("");
    const weight = product.weight ? `<div><small>Peso</small><strong>${e(product.weight)}</strong></div>` : "";
    const originalExtra = String(product.insert || "");
    const extra = originalExtra.toLowerCase().startsWith("inserto") ? `Relleno${originalExtra.slice(7)}` : originalExtra;
    const productWhatsapp = whatsappHref(catalog.contact, productWhatsappMessage(catalog.contact, product));
    pages.push(`<article${spec.first ? ` id="mobile-category-${e(spec.category.id)}"` : ""} class="mobile-page mobile-product" style="--category-color:${color(spec.category)}" data-mode="${e(product.imageMode || "contain")}">${header("mobile-header", spec.category.short || spec.category.name, product.name, spec.number)}<div class="mobile-product-image"><img src="${e(localProductImage(product))}" alt="${e(product.name)}" style="object-position:${e(product.imagePosition || "center center")}"></div><div class="mobile-product-copy"><div class="mobile-tags">${tags}</div><div class="mobile-description"><h2>${product.detailsLabel === "Descripción comercial" ? "Descripción" : "Ingredientes"}</h2><p>${e(product.ingredients)}</p>${extra ? `<strong>${e(extra)}</strong>` : ""}</div><div class="mobile-meta">${weight}<div><small>Formato</small><strong>${e(product.format)}</strong></div><div><small>${e(meta.priceLabel || "Valor neto")}</small><strong>${e(product.price)}</strong></div></div><a class="mobile-whatsapp" href="${e(productWhatsapp)}">Consultar por WhatsApp <span>↗</span></a></div></article>`);
  }

  priceChunks.forEach((group, index) => {
    const rows = group.map(row => `<div><strong>${e(row.product)}</strong><span>${e(row.format)}</span><b>${e(row.price)}</b></div>`).join("");
    pages.push(`<article class="mobile-page mobile-prices">${header("mobile-header", "Información comercial", meta.businessTitle || "Precios y servicio", priceStart + index)}<div class="mobile-price-intro"><p>Valores y formatos</p><h2>${e(meta.mobilePriceTitle || "Una propuesta clara para tu vitrina.")}</h2></div><div class="mobile-price-list">${rows}</div><p class="mobile-tax">${e(meta.taxNote)}</p></article>`);
  });
  const heating = catalog.storage.heating.map(item => `<li>${e(item)}</li>`).join("");
  const conservation = catalog.storage.conservation.map(item => `<li>${e(item)}</li>`).join("");
  faqChunks.forEach((group, index) => {
    const faq = group.map(item => `<section><h3>${e(item.question)}</h3><p>${e(item.answer)}</p></section>`).join("");
    const last = index === faqChunks.length - 1;
    const care = last ? `<div class="mobile-care"><div><h3>${e(meta.heatingTitle || "Calienta con cuidado.")}</h3><ul>${heating}</ul></div><div><h3>${e(meta.conservationTitle || "Guárdalas para después.")}</h3><ul>${conservation}</ul></div></div>` : "";
    pages.push(`<article class="mobile-page mobile-service ${last ? "with-care" : ""}">${header("mobile-header", "Servicio", "Preguntas frecuentes", serviceStart + index)}<div class="mobile-faq">${faq}</div>${care}</article>`);
  });
  pages.push(`<article class="mobile-page mobile-contact"><img class="contact-pattern" src="${pattern}" alt=""><div class="contact-copy"><img src="assets/brand/logo-principal.png" alt="Vestalia"><p>${e(meta.contactEyebrow || "Pedidos para cafeterías")}</p><h1>${editorialTitle(meta.contactTitle || "¿Qué ponemos en tu vitrina?")}</h1><span>${e(meta.contactText || "Consulta sabores y disponibilidad.")}</span><div><a href="${e(genericWhatsapp)}">WhatsApp · ${e(catalog.contact.whatsapp || catalog.contact.phone)}</a><a href="${e(catalog.contact.instagramUrl)}">${e(catalog.contact.instagram)}</a><a href="${e(catalog.contact.emailUrl)}">${e(catalog.contact.email)}</a></div><blockquote>${e(meta.mantra)}</blockquote><b>${String(contactPage).padStart(2, "0")}</b></div></article>`);
  const documentClass = `mobile-document${meta.theme === "personas" ? " personas-document" : ""}`;
  return { html: documentHtml(`${meta.brand} — ${meta.title} móvil`, ["mobile-print.css"], `<main>${pages.join("")}</main>`, origin, documentClass), pageCount: pages.length };
}
