(async () => {
  const params = new URLSearchParams(window.location.search);
  const catalogChannel = window.location.pathname.startsWith("/p") || params.get("catalogo") === "personas" ? "personas" : "cafeterias";
  const catalogApi = `/api/catalogo?catalogo=${catalogChannel}`;
  const pdfPaths = catalogChannel === "personas" ? { a4: "/p/c", mobile: "/p/m" } : { a4: "/c", mobile: "/m" };
  document.body.dataset.catalog = catalogChannel;
  document.body.classList.toggle("theme-personas", catalogChannel === "personas");
  let data = catalogChannel === "personas" ? window.VESTALIA_DATA_PERSONAS : window.VESTALIA_DATA;
  let cloudState = null;
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch(catalogApi, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.catalog) {
          data = payload.catalog;
          cloudState = payload;
        } else if (payload?.categories && payload?.products) {
          data = payload;
        }
      }
    } catch {
      // El archivo incluido mantiene visible el catálogo durante una caída de la API.
    }
  }
  if (!data) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">No fue posible cargar los datos del catálogo.</p>';
    return;
  }
  document.title = `${data.meta.brand || "Vestalia"} — ${data.meta.title}`;
  if (catalogChannel === "personas") {
    if (data.meta.draft) {
      const robots = document.createElement("meta");
      robots.name = "robots";
      robots.content = "noindex,nofollow";
      document.head.append(robots);
      document.body.insertAdjacentHTML("afterbegin", '<div class="draft-banner">Borrador · precios, formatos y productos por confirmar</div>');
    }
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const categories = Object.fromEntries(data.categories.map(category => [category.id, category]));
  const priceForRow = row => row.price;
  const editorialTitle = value => {
    const text = String(value || "").trim();
    const split = text.lastIndexOf(" ");
    return split < 0 ? `<em>${escapeHtml(text)}</em>` : `${escapeHtml(text.slice(0, split))}<br><em>${escapeHtml(text.slice(split + 1))}</em>`;
  };
  const thumbnailFor = source => {
    if (/^https?:\/\//i.test(String(source))) return source;
    const filename = String(source).split("/").pop() || "";
    const stem = filename.replace(/\.[^.]+$/, "");
    return `assets/thumbs/${stem}.webp`;
  };

  if (cloudState) {
    const a4 = $("#pdf-a4-link");
    const mobile = $("#pdf-mobile-link");
    if (a4) a4.href = pdfPaths.a4;
    if (mobile) mobile.href = pdfPaths.mobile;
  }

  function productCard(product, index = 0) {
    const category = categories[product.category] || {};
    return `
      <article class="product-card" data-image-mode="${escapeHtml(product.imageMode || "contain")}" data-tone="${escapeHtml(category.tone || "blue")}">
        <button class="product-card-button" type="button" data-product-id="${escapeHtml(product.id)}" aria-label="Ver detalle de ${escapeHtml(product.name)}">
          <div class="product-visual">
            <span class="product-badge">${escapeHtml(category.short || product.eyebrow)}</span>
            <img src="${escapeHtml(thumbnailFor(product.image))}" data-original="${escapeHtml(product.image)}" alt="" loading="eager" decoding="async" style="object-position:${escapeHtml(product.imagePosition || "center center")}">
          </div>
          <div class="product-content">
            <p class="product-eyebrow">${escapeHtml(product.eyebrow)}</p>
            <h4 class="product-title">${escapeHtml(product.name)}</h4>
            <div class="product-card-footer">
              <span class="product-price">${escapeHtml(product.price)}</span>
              <span class="product-more" aria-hidden="true">Ver ficha&nbsp; +</span>
            </div>
          </div>
        </button>
      </article>`;
  }

  function productDialog(product) {
    const tags = (product.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("");
    const isCommercialDescription = product.detailsLabel === "Descripción comercial";
    const detailTitle = isCommercialDescription ? "Descripción" : "Ingredientes y composición";
    const contactNumber = (data.contact.whatsapp || data.contact.phone || "").replace(/\D/g, "");
    const template = data.contact.productMessage || "Hola Vestalia, quisiera consultar por {producto} ({formato}).";
    const message = encodeURIComponent(template.replaceAll("{producto}", product.name).replaceAll("{formato}", product.format));
    const whatsappBase = data.contact.whatsappUrl || `https://wa.me/${contactNumber}`;
    const whatsapp = `${whatsappBase}${whatsappBase.includes("?") ? "&" : "?"}text=${message}`;
    return `
      <div class="dialog-layout">
        <div class="dialog-visual ${product.imageMode === "cover" ? "cover" : ""}">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" style="object-position:${escapeHtml(product.imagePosition || "center center")}">
        </div>
        <div class="dialog-copy">
          <p class="product-eyebrow">${escapeHtml(product.eyebrow)}</p>
          <h2 id="dialog-title">${escapeHtml(product.name)}</h2>
          <div class="product-tags">${tags}</div>
          <div class="dialog-facts">
            ${product.weight ? `<div><small>Peso</small><strong>${escapeHtml(product.weight)}</strong></div>` : ""}
            <div><small>Formato</small><strong>${escapeHtml(product.format)}</strong></div>
            <div><small>${escapeHtml(data.meta.priceLabel || "Valor neto")}</small><strong>${escapeHtml(product.price)}</strong></div>
          </div>
          <div class="dialog-description">
            <h3>${detailTitle}</h3>
            <p>${escapeHtml(product.ingredients)}</p>
            ${product.insert ? `<p>${isCommercialDescription ? "Nota: " : "Relleno: "}${escapeHtml(product.insert.replace(/^Inserto[^:]*:\s*/i, ""))}</p>` : ""}
          </div>
          <a class="button button-dark dialog-cta" href="${escapeHtml(whatsapp)}" target="_blank" rel="noreferrer">Consultar este producto <span aria-hidden="true">↗</span></a>
        </div>
      </div>`;
  }

  function renderWeb() {
    const catalogRoot = $("#web-catalog");
    if (!catalogRoot) return;

    if ($("#brand-intro-text")) $("#brand-intro-text").textContent = data.meta.intro;
    if ($("#brand-mantra")) $("#brand-mantra").textContent = data.meta.mantra;
    $("#hero-subtitle").textContent = data.meta.subtitle;
    $("#hero-audience").textContent = catalogChannel === "personas" ? "Selección para personas" : "Selección para cafeterías";
    $("#hero-title").innerHTML = editorialTitle(data.meta.title);
    $("#hero-lede").textContent = data.meta.heroLede || data.meta.intro;
    $("#hero-mantra").textContent = data.meta.mantra;
    $("#business-title").innerHTML = editorialTitle(data.meta.businessTitle || "Precios para cafeterías");
    $("#business-note").textContent = data.meta.taxNote;
    $("#price-value-label").textContent = data.meta.priceLabel || "Valor neto";
    $("#contact-title").innerHTML = editorialTitle(data.meta.contactTitle || "¿Qué ponemos en tu vitrina?");
    $("#contact-text").textContent = data.meta.contactText || "";
    $("#fact-delivery-time").textContent = data.meta.deliveryTimeValue || "";
    $("#fact-delivery-time-label").textContent = data.meta.deliveryTimeLabel || "";
    $("#fact-delivery-cost").textContent = data.meta.deliveryCostValue || "";
    $("#fact-delivery-cost-label").textContent = data.meta.deliveryCostLabel || "";
    $("#fact-invoice").textContent = data.meta.invoiceValue || "";
    $("#fact-invoice-label").textContent = data.meta.invoiceLabel || "";
    $("#fact-tax").textContent = data.meta.taxValue || "";
    $("#fact-tax-label").textContent = data.meta.taxLabel || "";
    $("#footer-mantra").textContent = data.meta.mantra;
    if ($("#product-count")) $("#product-count").textContent = data.products.length;
    if ($("#category-count")) $("#category-count").textContent = data.categories.length;
    $("#tax-note").textContent = data.meta.taxNote;
    $("#year").textContent = new Date().getFullYear();

    const filterRoot = $("#category-filters");
    const availableCategoryIds = new Set(data.products.map(product => product.category));
    const visibleCategories = data.categories.filter(category => availableCategoryIds.has(category.id));
    filterRoot.innerHTML = [
      `<button class="filter-button active" type="button" data-category="all" aria-pressed="true">Todo</button>`,
      ...visibleCategories.map(category => `<button class="filter-button" type="button" data-category="${escapeHtml(category.id)}" aria-pressed="false">${escapeHtml(category.short)}</button>`)
    ].join("");

    let activeCategory = "all";
    let searchTerm = "";

    function drawCatalog() {
      const normalized = searchTerm.trim().toLocaleLowerCase("es");
      const filtered = data.products.filter(product => {
        const categoryMatch = activeCategory === "all" || product.category === activeCategory;
        const text = [product.name, product.eyebrow, product.ingredients, product.insert, ...(product.tags || [])].join(" ").toLocaleLowerCase("es");
        return categoryMatch && (!normalized || text.includes(normalized));
      });

      catalogRoot.innerHTML = `<div class="catalog-grid">${filtered.map((product, index) => productCard(product, index)).join("")}</div>`;

      $("#empty-state").hidden = filtered.length > 0;
      $("#results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "producto" : "productos"}`;
      catalogRoot.querySelectorAll("img").forEach(image => {
        image.addEventListener("error", () => {
          const original = image.dataset.original;
          if (original && image.getAttribute("src") !== original) {
            image.src = original;
            return;
          }
          image.src = "assets/brand/isotipo.png";
          image.classList.add("image-fallback");
        });
      });
    }

    filterRoot.addEventListener("click", event => {
      const button = event.target.closest("button[data-category]");
      if (!button) return;
      activeCategory = button.dataset.category;
      filterRoot.querySelectorAll("button").forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      drawCatalog();
    });
    $("#product-search").addEventListener("input", event => {
      searchTerm = event.target.value;
      drawCatalog();
    });
    $("#clear-search").addEventListener("click", () => {
      activeCategory = "all";
      searchTerm = "";
      $("#product-search").value = "";
      filterRoot.querySelectorAll("button").forEach((item, index) => {
        item.classList.toggle("active", index === 0);
        item.setAttribute("aria-pressed", String(index === 0));
      });
      drawCatalog();
    });
    drawCatalog();

    $("#price-list").innerHTML = data.prices.map(row => `
      <div class="price-row"><strong>${escapeHtml(row.product)}</strong><span>${escapeHtml(row.format)}</span><b>${escapeHtml(priceForRow(row))}</b></div>`).join("");

    $("#care-note").textContent = data.storage.note;
    $("#care-content").innerHTML = `
      <section class="care-block"><span aria-hidden="true">♨</span><h3>${escapeHtml(data.meta.heatingTitle || "Calienta con cuidado")}</h3><ul>${data.storage.heating.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="care-block"><span aria-hidden="true">❄</span><h3>${escapeHtml(data.meta.conservationTitle || "Guárdalas para después")}</h3><ul>${data.storage.conservation.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;

    const contact = data.contact;
    const genericMessage = encodeURIComponent(contact.genericMessage || "Hola Vestalia, quisiera información para mi cafetería.");
    const contactItems = [
      ["WhatsApp", contact.whatsapp || contact.phone, (() => { const base = contact.whatsappUrl || `https://wa.me/${(contact.whatsapp || contact.phone || "").replace(/\D/g, "")}`; return `${base}${base.includes("?") ? "&" : "?"}text=${genericMessage}`; })()],
      ["Instagram", contact.instagram, contact.instagramUrl],
      ["Correo", contact.email, contact.emailUrl]
    ];
    $("#contact-links").innerHTML = contactItems.map(([label, value, url]) => `
      <a class="contact-link" href="${escapeHtml(url)}" ${url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}><small>${label}</small><strong>${escapeHtml(value)}</strong><span aria-hidden="true">↗</span></a>`).join("");

    $("#faq-list").innerHTML = data.faq.map((item, index) => `
      <details class="faq-item" ${index === 0 ? "open" : ""}><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join("");

    const dialog = $("#product-dialog");
    catalogRoot.addEventListener("click", event => {
      const button = event.target.closest("[data-product-id]");
      if (!button) return;
      const product = data.products.find(item => item.id === button.dataset.productId);
      if (!product) return;
      $("#dialog-content").innerHTML = productDialog(product);
      dialog.showModal();
      document.body.style.overflow = "hidden";
    });
    function closeDialog() {
      dialog.close();
      document.body.style.overflow = "";
    }
    $("#dialog-close").addEventListener("click", closeDialog);
    dialog.addEventListener("click", event => {
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeDialog();
    });
    dialog.addEventListener("close", () => { document.body.style.overflow = ""; });

    const menuButton = $("#menu-toggle");
    const nav = $("#site-nav");
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") !== "true";
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      nav.classList.toggle("open", open);
      document.body.classList.toggle("menu-open", open);
    });
    nav.addEventListener("click", event => {
      if (!event.target.closest("a")) return;
      menuButton.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
      document.body.classList.remove("menu-open");
    });
    const mobileContact = $(".mobile-contact");
    const updateMobileContact = () => mobileContact?.classList.toggle("visible", window.scrollY > 520);
    window.addEventListener("scroll", updateMobileContact, { passive: true });
    updateMobileContact();
  }

  function chunk(array, size) {
    const chunks = [];
    for (let index = 0; index < array.length; index += size) chunks.push(array.slice(index, index + size));
    return chunks;
  }

  function printProduct(product) {
    return `
      <article class="print-product-card" data-mode="${escapeHtml(product.imageMode || "contain")}">
        <div class="print-product-image"><img src="${escapeHtml(product.image)}" alt="" style="object-position:${escapeHtml(product.imagePosition || "center center")}"></div>
        <div class="print-product-copy">
          <p class="print-eyebrow">${escapeHtml(product.eyebrow)}</p>
          <h2>${escapeHtml(product.name)}</h2>
          <div class="print-tags">${(product.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <p class="print-ingredients">${escapeHtml(product.ingredients)}</p>
          ${product.insert ? `<p class="print-insert">${escapeHtml(product.insert.replace(/^Inserto/i, "Relleno"))}</p>` : ""}
          <div class="print-meta">
            ${product.weight ? `<div><small>Peso</small><strong>${escapeHtml(product.weight)}</strong></div>` : ""}
            <div><small>Formato</small><strong>${escapeHtml(product.format)}</strong></div>
            <div><small>Precio</small><strong>${escapeHtml(product.price)}</strong></div>
          </div>
        </div>
      </article>`;
  }

  function renderPrint() {
    const root = $("#print-catalog");
    if (!root) return;
    const coverImages = ["tradicional-limon-amapola", "tradicional-brownie", "tradicional-red-velvet", "vegana-pistacho", "tradicional-nutella", "tradicional-carrot-cookie"]
      .map(id => data.products.find(product => product.id === id)?.image).filter(Boolean);
    const pages = [];
    pages.push(`
      <article class="print-page print-cover">
        <div class="print-frame"></div>
        ${coverImages.map((src, index) => `<img class="cover-cookie cover-cookie-${index + 1}" src="${escapeHtml(src)}" alt="">`).join("")}
        <div class="cover-center"><img src="assets/brand/logo-principal.png" alt="Vestalia"><p>${escapeHtml(data.meta.subtitle)}</p><h1>${editorialTitle(data.meta.title)}</h1><em>${escapeHtml(data.meta.mantra)}</em><span>${escapeHtml(data.meta.edition)}</span></div>
      </article>`);
    pages.push(`
      <article class="print-page print-intro-page">
        <div class="intro-brand-mark"><img src="assets/brand/isotipo.png" alt=""></div>
        <div class="intro-headline"><p>01 / Esencia Vestalia</p><h1>Tradición, limpieza y frescura con un toque de encanto.</h1></div>
        <div class="intro-body"><p>${escapeHtml(data.meta.intro)}</p><blockquote>${escapeHtml(data.meta.mantra)}</blockquote><div class="intro-notes"><p>${escapeHtml(data.meta.cookieNote)}</p><p>${escapeHtml(data.meta.ferreroNote)}</p></div></div>
        <div class="intro-metrics"><div><strong>${data.products.length}</strong><span>productos</span></div><div><strong>${data.categories.length}</strong><span>categorías</span></div><div><strong>48 h</strong><span>despacho máximo</span></div></div>
      </article>`);
    let pageNumber = 2;
    data.categories.forEach(category => {
      const products = data.products.filter(product => product.category === category.id);
      chunk(products, 2).forEach(group => {
        pageNumber += 1;
        pages.push(`<article class="print-page print-products-page tone-${escapeHtml(category.tone)}"><header class="print-category-header"><div><p>02 / Colección Vestalia</p><h1>${escapeHtml(category.name)}</h1></div><span>${String(pageNumber).padStart(2, "0")}</span></header><div class="print-product-grid ${group.length === 1 ? "single" : ""}">${group.map(printProduct).join("")}</div></article>`);
      });
    });
    pages.push(`
      <article class="print-page print-business-page"><header class="print-category-header"><div><p>03 / Condiciones comerciales</p><h1>Precios y despacho</h1></div><span>${String(pageNumber + 1).padStart(2, "0")}</span></header><div class="print-price-table">${data.prices.map(row => `<div><strong>${escapeHtml(row.product)}</strong><span>${escapeHtml(row.format)}</span><b>${escapeHtml(priceForRow(row))}</b></div>`).join("")}</div><p class="print-tax-note">${escapeHtml(data.meta.taxNote)}</p><div class="print-faq-grid">${data.faq.map(item => `<section><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></section>`).join("")}</div><div class="business-seal"><img src="assets/brand/sello-circular.png" alt=""></div></article>`);
    pages.push(`
      <article class="print-page print-care-page"><div class="care-left"><img src="assets/images/cover-pattern-cookies.webp" alt="Galletas Vestalia"><img class="care-logo" src="assets/brand/logo-principal.png" alt="Vestalia"></div><div class="care-right"><p class="print-eyebrow">04 / Servicio y contacto</p><h1>Como recién<br>horneadas.</h1><p>${escapeHtml(data.storage.note)}</p><h3>Calienta con cuidado</h3><ul>${data.storage.heating.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Guárdalas para después</h3><ul>${data.storage.conservation.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><div class="print-contact"><strong>${escapeHtml(data.contact.instagram)}</strong><strong>${escapeHtml(data.contact.phone)}</strong><strong>${escapeHtml(data.contact.email)}</strong></div><blockquote>${escapeHtml(data.meta.mantra)}</blockquote></div></article>`);
    root.innerHTML = pages.join("");
  }

  renderWeb();
  renderPrint();
})();
