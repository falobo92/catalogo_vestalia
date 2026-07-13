(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let catalog = structuredClone(window.VESTALIA_DATA || {});
  let currentIndex = 0;
  let serverMode = false;
  let cloudMode = false;
  let catalogRevision = 1;
  let pdfRevision = 0;
  let updatedAt = null;
  let pdfUpdatedAt = null;
  let dirty = false;
  let toastTimer;
  let categoryDraft = [];

  const fields = {
    index: $("#field-index"), name: $("#field-name"), id: $("#field-id"), category: $("#field-category"),
    eyebrow: $("#field-eyebrow"), image: $("#field-image"), weight: $("#field-weight"), format: $("#field-format"),
    price: $("#field-price"), tags: $("#field-tags"), detailsLabel: $("#field-details-label"), imagePosition: $("#field-image-position"),
    ingredients: $("#field-ingredients"), insert: $("#field-insert"), imageMode: $("#field-image-mode")
  };

  function slug(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function uniqueProductId(base) {
    const clean = slug(base) || "nuevo-producto";
    let candidate = clean;
    let suffix = 2;
    while (catalog.products.some(product => product.id === candidate)) candidate = `${clean}-${suffix++}`;
    return candidate;
  }

  function showToast(message, error = false) {
    const toast = $("#toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function setDirty(value = true) {
    dirty = value;
    const indicator = $("#save-indicator");
    indicator.classList.toggle("dirty", value);
    indicator.classList.remove("saving");
    indicator.lastChild.textContent = value ? " Cambios pendientes de guardar" : " Sin cambios pendientes";
  }

  function setSaving() {
    const indicator = $("#save-indicator");
    indicator.classList.remove("dirty");
    indicator.classList.add("saving");
    indicator.lastChild.textContent = " Guardando…";
  }

  function formatDate(value) {
    if (!value) return "sin fecha";
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function updateCloudState(state = {}) {
    if (!cloudMode) return;
    catalogRevision = Number(state.revision ?? catalogRevision);
    pdfRevision = Number(state.pdfRevision ?? pdfRevision);
    updatedAt = state.updatedAt ?? updatedAt;
    pdfUpdatedAt = state.pdfUpdatedAt ?? pdfUpdatedAt;
    const pending = pdfRevision !== catalogRevision;
    const panel = $("#cloud-state");
    panel.hidden = false;
    panel.classList.toggle("pending", pending);
    panel.innerHTML = `<strong>Catálogo · revisión ${catalogRevision}</strong><span>Guardado ${escapeHtml(formatDate(updatedAt))}</span><strong>PDF · revisión ${pdfRevision || "pendiente"}</strong><span>${pending ? "Los PDF requieren regeneración" : `Actualizados ${escapeHtml(formatDate(pdfUpdatedAt))}`}</span>`;
    $("#editor-pdf-a4").href = "/api/pdf?tipo=a4";
    $("#editor-pdf-mobile").href = "/api/pdf?tipo=movil";
  }

  function download(filename, content, type = "application/json") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  function renderCategories() {
    fields.category.innerHTML = catalog.categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
  }

  function renderList(filter = "") {
    const term = filter.trim().toLocaleLowerCase("es");
    const categoryMap = Object.fromEntries(catalog.categories.map(category => [category.id, category]));
    const items = catalog.products.map((product, index) => ({ product, index })).filter(({ product }) => {
      const text = [product.name, product.category, product.ingredients, ...(product.tags || [])].join(" ").toLocaleLowerCase("es");
      return !term || text.includes(term);
    });
    $("#editor-product-list").innerHTML = items.map(({ product, index }) => `
      <button class="editor-list-item ${index === currentIndex ? "active" : ""}" data-index="${index}" data-mode="${escapeHtml(product.imageMode || "contain")}" type="button">
        <span class="editor-list-thumb"><img src="${escapeHtml(product.image)}" alt="" loading="lazy"></span>
        <span class="editor-list-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(categoryMap[product.category]?.short || product.category)}</small></span>
      </button>`).join("");
    $("#sidebar-count").textContent = `${catalog.products.length} ${catalog.products.length === 1 ? "producto" : "productos"}`;
  }

  function updatePreview() {
    const preview = $("#editor-preview");
    preview.src = fields.image.value || "assets/brand/isotipo.png";
    preview.style.objectPosition = fields.imagePosition.value || "center center";
    $(".image-preview").dataset.mode = fields.imageMode.value || "contain";
  }

  function loadProduct(index) {
    if (!catalog.products.length) return;
    currentIndex = Math.max(0, Math.min(index, catalog.products.length - 1));
    const product = catalog.products[currentIndex];
    fields.index.value = currentIndex;
    fields.name.value = product.name || "";
    fields.id.value = product.id || "";
    fields.category.value = product.category || catalog.categories[0].id;
    fields.eyebrow.value = product.eyebrow || "";
    fields.image.value = product.image || "";
    fields.weight.value = product.weight || "";
    fields.format.value = product.format || "";
    fields.price.value = product.price || "";
    fields.tags.value = (product.tags || []).join(", ");
    fields.detailsLabel.value = product.detailsLabel || "Ingredientes y composición";
    fields.imagePosition.value = product.imagePosition || "center center";
    fields.ingredients.value = product.ingredients || "";
    fields.insert.value = product.insert || "";
    fields.imageMode.value = product.imageMode || "contain";
    fields.id.dataset.touched = "";
    $("#editor-title").textContent = product.name || "Editar producto";
    $("#product-position").textContent = `Producto ${currentIndex + 1} de ${catalog.products.length}`;
    updatePreview();
    renderList($("#editor-search").value);
  }

  function readForm() {
    const previous = catalog.products[currentIndex] || {};
    return {
      ...previous,
      name: fields.name.value.trim(),
      id: fields.id.value.trim() || slug(fields.name.value),
      category: fields.category.value,
      eyebrow: fields.eyebrow.value.trim(),
      image: fields.image.value.trim(),
      imageMode: fields.imageMode.value,
      imagePosition: fields.imagePosition.value.trim() || "center center",
      weight: fields.weight.value.trim(),
      format: fields.format.value.trim(),
      price: fields.price.value.trim(),
      tags: fields.tags.value.split(",").map(value => value.trim()).filter(Boolean),
      detailsLabel: fields.detailsLabel.value,
      ingredients: fields.ingredients.value.trim(),
      insert: fields.insert.value.trim()
    };
  }

  function applyForm({ notify = false } = {}) {
    if (!catalog.products.length) return true;
    const product = readForm();
    const previous = catalog.products[currentIndex];
    if (!product.name || !product.id || !product.image || !product.format || !product.price) {
      showToast("Completa nombre, ID, imagen, formato y precio.", true);
      return false;
    }
    const duplicate = catalog.products.findIndex((item, index) => item.id === product.id && index !== currentIndex);
    if (duplicate >= 0) {
      showToast(`El ID “${product.id}” ya pertenece a otro producto.`, true);
      fields.id.focus();
      return false;
    }
    const normalizedPrevious = {
      ...previous,
      name: previous.name || "", id: previous.id || "", category: previous.category || catalog.categories[0].id,
      eyebrow: previous.eyebrow || "", image: previous.image || "", imageMode: previous.imageMode || "contain",
      imagePosition: previous.imagePosition || "center center", weight: previous.weight || "", format: previous.format || "",
      price: previous.price || "", tags: previous.tags || [], detailsLabel: previous.detailsLabel || "Ingredientes y composición",
      ingredients: previous.ingredients || "", insert: previous.insert || ""
    };
    const changed = JSON.stringify(normalizedPrevious) !== JSON.stringify(product);
    if (changed) catalog.products[currentIndex] = product;
    $("#editor-title").textContent = product.name;
    renderList($("#editor-search").value);
    if (changed) setDirty(true);
    if (notify) showToast("Cambios aplicados. Guarda el catálogo para publicarlos.");
    return true;
  }

  async function saveCatalog() {
    if (!applyForm()) return;
    if (!serverMode) {
      download("catalogo.json", JSON.stringify(catalog, null, 2) + "\n");
      download("catalog-data.js", `window.VESTALIA_DATA = ${JSON.stringify(catalog, null, 2)};\n`, "text/javascript");
      showToast("Modo respaldo: se descargaron los datos. Usa iniciar_catalogo para guardar directo.");
      return;
    }
    setSaving();
    try {
      const response = await fetch("/api/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloudMode ? { catalog, revision: catalogRevision } : catalog)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible guardar.");
      if (cloudMode) updateCloudState(result);
      setDirty(false);
      showToast(cloudMode
        ? `Catálogo publicado en la revisión ${result.revision}. Ahora puedes regenerar los PDF.`
        : `Catálogo, PDF A4 y PDF móvil actualizados: ${result.products} productos.`);
    } catch (error) {
      setDirty(true);
      showToast(error.message, true);
    }
  }

  async function optimizeImage(file) {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    const maximum = 1800;
    if (Math.max(width, height) > maximum) {
      const ratio = maximum / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const encode = quality => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("El navegador no pudo optimizar la imagen.")), "image/webp", quality));
    let quality = .88;
    let blob = await encode(quality);
    while (blob.size > 3.9 * 1024 * 1024 && quality > .5) {
      quality -= .08;
      blob = await encode(quality);
    }
    if (blob.size > 4 * 1024 * 1024) throw new Error("La imagen no pudo reducirse bajo 4 MB.");
    return blob;
  }

  async function uploadImage(file) {
    if (!file) return;
    if (!serverMode) {
      showToast("Para subir imágenes, abre el editor con iniciar_catalogo.", true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("La imagen supera el máximo de 15 MB.", true);
      return;
    }
    const uploadButton = $(".upload-button");
    const original = uploadButton.childNodes[0].textContent;
    uploadButton.childNodes[0].textContent = "Subiendo… ";
    try {
      const body = cloudMode ? await optimizeImage(file) : file;
      const cloudName = `${file.name.replace(/\.[^.]+$/, "")}.webp`;
      const response = await fetch(`/api/imagenes?nombre=${encodeURIComponent(cloudMode ? cloudName : file.name)}`, {
        method: "POST",
        headers: cloudMode
          ? { "Content-Type": "image/webp", "X-File-Name": cloudName }
          : { "Content-Type": file.type || "application/octet-stream" },
        body
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible subir la imagen.");
      fields.image.value = result.path;
      updatePreview();
      setDirty(true);
      showToast("Imagen subida y vinculada al producto.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      uploadButton.childNodes[0].textContent = original;
      $("#upload-image").value = "";
    }
  }

  async function detectServer() {
    const status = $("#server-status");
    if (window.location.protocol === "file:") {
      serverMode = false;
      status.classList.add("offline");
      status.querySelector("span").textContent = "Modo respaldo";
      return;
    }
    try {
      const stateResponse = await fetch("/api/estado", { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("offline");
      const serverState = await stateResponse.json();
      cloudMode = serverState.mode === "cloud";
      if (cloudMode) {
        const session = await fetch("/api/auth/session", { cache: "no-store" }).then(item => item.json());
        if (!session.authenticated) {
          window.location.replace("/login.html");
          return false;
        }
        document.querySelectorAll(".cloud-only").forEach(element => { element.hidden = false; });
      }
      const response = await fetch("/api/catalogo", { cache: "no-store" });
      if (!response.ok) throw new Error("offline");
      const payload = await response.json();
      catalog = payload.catalog || payload;
      serverMode = true;
      status.classList.add("online");
      status.querySelector("span").textContent = cloudMode ? "Nube conectada" : "Guardado directo activo";
      if (cloudMode) updateCloudState(payload);
      return true;
    } catch {
      serverMode = false;
      cloudMode = false;
      status.classList.add("offline");
      status.querySelector("span").textContent = "Modo respaldo";
      return false;
    }
  }

  async function regeneratePdf() {
    if (!cloudMode) return;
    if (dirty) return showToast("Guarda primero los cambios pendientes.", true);
    const button = $("#regenerate-pdf");
    button.disabled = true;
    const strong = button.querySelector("strong");
    const previous = strong.textContent;
    strong.textContent = "Generando…";
    showToast("Generando ambos PDF. Puede tardar uno o dos minutos.");
    try {
      const response = await fetch("/api/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: catalogRevision }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible regenerar los PDF.");
      updateCloudState(result);
      showToast("PDF A4 y móvil regenerados correctamente.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
      strong.textContent = previous;
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/login.html");
  }

  function newProduct() {
    if (!applyForm()) return;
    catalog.products.push({
      id: uniqueProductId("nuevo-producto"),
      category: catalog.categories[0].id,
      name: "Nuevo producto",
      eyebrow: "Producto Vestalia",
      image: "assets/images/",
      imageMode: "contain",
      imagePosition: "center center",
      weight: "",
      format: "Unidad",
      price: "A cotizar",
      tags: [],
      detailsLabel: "Ingredientes y composición",
      ingredients: "",
      insert: ""
    });
    setDirty(true);
    loadProduct(catalog.products.length - 1);
    fields.name.select();
  }

  function moveProduct(direction) {
    if (!applyForm()) return;
    const target = currentIndex + direction;
    if (target < 0 || target >= catalog.products.length) return;
    [catalog.products[currentIndex], catalog.products[target]] = [catalog.products[target], catalog.products[currentIndex]];
    currentIndex = target;
    setDirty(true);
    loadProduct(currentIndex);
  }

  function categoryOptions(selected = "", includeNone = false) {
    const first = includeNone ? '<option value="">Sin sincronización</option>' : "";
    return first + catalog.categories.map(category => `<option value="${escapeHtml(category.id)}" ${category.id === selected ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");
  }

  function categoryRow(category, originalId = category.id) {
    const color = /^#[0-9a-f]{6}$/i.test(category.color || "") ? category.color : "#B6D2EF";
    return `
      <div class="category-editor-row" data-original-id="${escapeHtml(originalId || "")}">
        <label>Color<span class="category-color-wrap"><input type="color" data-field="color-picker" value="${color}"><input data-field="color" value="${color}" maxlength="7"></span></label>
        <label>ID único<input data-field="id" value="${escapeHtml(category.id || "")}" pattern="[a-z0-9-]+"></label>
        <label>Nombre en PDF<input data-field="name" value="${escapeHtml(category.name || "")}"></label>
        <label>Nombre corto<input data-field="short" value="${escapeHtml(category.short || "")}"></label>
        <div class="category-actions"><button type="button" data-category-action="up" title="Mover arriba">↑</button><button type="button" data-category-action="down" title="Mover abajo">↓</button><button class="category-delete" type="button" data-category-action="delete" title="Eliminar">×</button></div>
        <label class="category-description">Descripción<input data-field="description" value="${escapeHtml(category.description || "")}"></label>
      </div>`;
  }

  function renderCategoryEditor() {
    $("#category-editor-list").innerHTML = categoryDraft.map(category => categoryRow(category, category.originalId ?? category.id)).join("");
  }

  function readCategoryRows() {
    return [...document.querySelectorAll(".category-editor-row")].map(row => ({
      originalId: row.dataset.originalId,
      id: row.querySelector('[data-field="id"]').value.trim(),
      name: row.querySelector('[data-field="name"]').value.trim(),
      short: row.querySelector('[data-field="short"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      color: row.querySelector('[data-field="color"]').value.trim().toUpperCase(),
      tone: catalog.categories.find(category => category.id === row.dataset.originalId)?.tone || "blue"
    }));
  }

  function openCategories() {
    if (!applyForm()) return;
    categoryDraft = structuredClone(catalog.categories).map(category => ({ ...category, originalId: category.id }));
    renderCategoryEditor();
    $("#categories-dialog").showModal();
  }

  async function applyCategories() {
    const next = readCategoryRows();
    if (!next.length) return showToast("Debe existir al menos una categoría.", true);
    const invalid = next.find(category => !category.id || !category.name || !category.short || !/^[a-z0-9-]+$/.test(category.id) || !/^#[0-9A-F]{6}$/.test(category.color));
    if (invalid) return showToast("Completa ID, nombre, nombre corto y un color hexadecimal válido en cada categoría.", true);
    const ids = next.map(category => category.id);
    if (new Set(ids).size !== ids.length) return showToast("Los IDs de categoría no pueden repetirse.", true);

    const idChanges = Object.fromEntries(next.filter(category => category.originalId && category.originalId !== category.id).map(category => [category.originalId, category.id]));
    const unresolved = catalog.products.find(product => !ids.includes(idChanges[product.category] || product.category));
    if (unresolved) return showToast(`No puedes eliminar la categoría usada por “${unresolved.name}”. Reasigna primero ese producto.`, true);
    catalog.products.forEach(product => { if (idChanges[product.category]) product.category = idChanges[product.category]; });
    catalog.prices = catalog.prices
      .map(row => ({ ...row, category: idChanges[row.category] || row.category }))
      .filter(row => !row.category || ids.includes(row.category));
    catalog.categories = next.map(({ originalId, ...category }) => category);
    renderCategories();
    loadProduct(currentIndex);
    setDirty(true);
    $("#categories-dialog").close();
    await saveCatalog();
  }

  function priceRow(row = {}) {
    return `
      <div class="price-editor-row">
        <label>Categoría<select data-field="category">${categoryOptions(row.category || "", true)}</select></label>
        <label>Nombre en tabla<input data-field="product" value="${escapeHtml(row.product || "")}"></label>
        <label>Formato<input data-field="format" value="${escapeHtml(row.format || "")}"></label>
        <label>Precio<input data-field="price" value="${escapeHtml(row.price || "")}"></label>
        <button class="repeat-delete" type="button" data-repeat-delete aria-label="Eliminar fila">×</button>
      </div>`;
  }

  function faqRow(row = {}) {
    return `
      <div class="faq-editor-row">
        <label>Pregunta<input data-field="question" value="${escapeHtml(row.question || "")}"></label>
        <label>Respuesta<input data-field="answer" value="${escapeHtml(row.answer || "")}"></label>
        <button class="repeat-delete" type="button" data-repeat-delete aria-label="Eliminar pregunta">×</button>
      </div>`;
  }

  function renderSettingsEditor() {
    const meta = catalog.meta || {};
    $("#setting-title").value = meta.title || "";
    $("#setting-subtitle").value = meta.subtitle || "";
    $("#setting-hero-lede").value = meta.heroLede || "";
    $("#setting-mantra").value = meta.mantra || "";
    $("#setting-edition").value = meta.edition || "";
    $("#setting-intro").value = meta.intro || "";
    $("#setting-intro-kicker").value = meta.introKicker || "";
    $("#setting-intro-title").value = meta.introTitle || "";
    $("#setting-intro-bottom").value = meta.introBottom || "";
    $("#setting-business-title").value = meta.businessTitle || "";
    $("#setting-cookie-note").value = meta.cookieNote || "";
    $("#setting-ferrero-note").value = meta.ferreroNote || "";
    $("#setting-tax-note").value = meta.taxNote || "";
    $("#setting-delivery-time-value").value = meta.deliveryTimeValue || "";
    $("#setting-delivery-time-label").value = meta.deliveryTimeLabel || "";
    $("#setting-delivery-cost-value").value = meta.deliveryCostValue || "";
    $("#setting-delivery-cost-label").value = meta.deliveryCostLabel || "";
    $("#setting-invoice-value").value = meta.invoiceValue || "";
    $("#setting-invoice-label").value = meta.invoiceLabel || "";
    $("#setting-tax-value").value = meta.taxValue || "";
    $("#setting-tax-label").value = meta.taxLabel || "";
    $("#price-editor-list").innerHTML = (catalog.prices || []).map(priceRow).join("");
    $("#faq-editor-list").innerHTML = (catalog.faq || []).map(faqRow).join("");
    $("#setting-storage-note").value = catalog.storage?.note || "";
    $("#setting-heating").value = (catalog.storage?.heating || []).join("\n");
    $("#setting-conservation").value = (catalog.storage?.conservation || []).join("\n");
    $("#setting-heating-title").value = meta.heatingTitle || "";
    $("#setting-conservation-title").value = meta.conservationTitle || "";
    const contact = catalog.contact || {};
    $("#setting-instagram").value = contact.instagram || "";
    $("#setting-instagram-url").value = contact.instagramUrl || "";
    $("#setting-phone").value = contact.phone || "";
    $("#setting-whatsapp").value = contact.whatsapp || contact.phone || "";
    $("#setting-email").value = contact.email || "";
    $("#setting-whatsapp-url").value = contact.whatsappUrl || "";
    $("#setting-contact-eyebrow").value = meta.contactEyebrow || "";
    $("#setting-contact-title").value = meta.contactTitle || "";
    $("#setting-contact-text").value = meta.contactText || "";
  }

  function openSettings() {
    if (!applyForm()) return;
    renderSettingsEditor();
    $("#settings-dialog").showModal();
  }

  function lines(value) {
    return value.split("\n").map(item => item.trim()).filter(Boolean);
  }

  async function applySettings() {
    const prices = [...document.querySelectorAll(".price-editor-row")].map(row => ({
      category: row.querySelector('[data-field="category"]').value,
      product: row.querySelector('[data-field="product"]').value.trim(),
      format: row.querySelector('[data-field="format"]').value.trim(),
      price: row.querySelector('[data-field="price"]').value.trim()
    }));
    if (prices.some(row => !row.product || !row.format || !row.price)) return showToast("Completa nombre, formato y precio en todas las filas.", true);
    const faq = [...document.querySelectorAll(".faq-editor-row")].map(row => ({
      question: row.querySelector('[data-field="question"]').value.trim(),
      answer: row.querySelector('[data-field="answer"]').value.trim()
    }));
    if (faq.some(row => !row.question || !row.answer)) return showToast("Completa todas las preguntas y respuestas.", true);

    catalog.meta = {
      ...catalog.meta,
      title: $("#setting-title").value.trim(), subtitle: $("#setting-subtitle").value.trim(),
      heroLede: $("#setting-hero-lede").value.trim(),
      mantra: $("#setting-mantra").value.trim(), edition: $("#setting-edition").value.trim(),
      intro: $("#setting-intro").value.trim(), cookieNote: $("#setting-cookie-note").value.trim(),
      introKicker: $("#setting-intro-kicker").value.trim(), introTitle: $("#setting-intro-title").value.trim(),
      introBottom: $("#setting-intro-bottom").value.trim(), businessTitle: $("#setting-business-title").value.trim(),
      heatingTitle: $("#setting-heating-title").value.trim(), conservationTitle: $("#setting-conservation-title").value.trim(),
      contactEyebrow: $("#setting-contact-eyebrow").value.trim(), contactTitle: $("#setting-contact-title").value.trim(),
      contactText: $("#setting-contact-text").value.trim(), ferreroNote: $("#setting-ferrero-note").value.trim(),
      taxNote: $("#setting-tax-note").value.trim(),
      deliveryTimeValue: $("#setting-delivery-time-value").value.trim(), deliveryTimeLabel: $("#setting-delivery-time-label").value.trim(),
      deliveryCostValue: $("#setting-delivery-cost-value").value.trim(), deliveryCostLabel: $("#setting-delivery-cost-label").value.trim(),
      invoiceValue: $("#setting-invoice-value").value.trim(), invoiceLabel: $("#setting-invoice-label").value.trim(),
      taxValue: $("#setting-tax-value").value.trim(), taxLabel: $("#setting-tax-label").value.trim()
    };
    catalog.prices = prices;
    catalog.faq = faq;
    catalog.storage = {
      note: $("#setting-storage-note").value.trim(),
      heating: lines($("#setting-heating").value),
      conservation: lines($("#setting-conservation").value)
    };
    const phone = $("#setting-phone").value.trim();
    const whatsapp = $("#setting-whatsapp").value.trim();
    const email = $("#setting-email").value.trim();
    const whatsappDigits = whatsapp.replace(/\D/g, "");
    const previousWhatsAppDigits = (catalog.contact?.whatsapp || catalog.contact?.phone || "").replace(/\D/g, "");
    const previousAutomaticUrl = previousWhatsAppDigits ? `https://wa.me/${previousWhatsAppDigits}` : "";
    const enteredWhatsAppUrl = $("#setting-whatsapp-url").value.trim();
    const automaticWhatsAppUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "";
    catalog.contact = {
      instagram: $("#setting-instagram").value.trim(),
      instagramUrl: $("#setting-instagram-url").value.trim(),
      phone, phoneUrl: phone ? `tel:+${phone.replace(/\D/g, "")}` : "",
      whatsapp, whatsappUrl: !enteredWhatsAppUrl || enteredWhatsAppUrl === previousAutomaticUrl ? automaticWhatsAppUrl : enteredWhatsAppUrl,
      email, emailUrl: email ? `mailto:${email}` : ""
    };
    loadProduct(currentIndex);
    setDirty(true);
    $("#settings-dialog").close();
    await saveCatalog();
  }

  async function initialize() {
    const ready = await detectServer();
    if (cloudMode && ready === false) return;
    if (!catalog.categories || !catalog.products) {
      showToast("No se encontró una base de catálogo válida.", true);
      return;
    }
    renderCategories();
    loadProduct(0);
    setDirty(false);
  }

  $("#product-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (applyForm()) await saveCatalog();
  });
  $("#manage-categories").addEventListener("click", openCategories);
  $("#manage-settings").addEventListener("click", openSettings);
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
  $("#category-editor-list").addEventListener("input", event => {
    const row = event.target.closest(".category-editor-row");
    if (!row) return;
    if (event.target.dataset.field === "color-picker") row.querySelector('[data-field="color"]').value = event.target.value.toUpperCase();
    if (event.target.dataset.field === "color" && /^#[0-9a-f]{6}$/i.test(event.target.value)) row.querySelector('[data-field="color-picker"]').value = event.target.value;
    if (event.target.dataset.field === "name" && !row.querySelector('[data-field="id"]').dataset.touched) {
      row.querySelector('[data-field="id"]').value = slug(event.target.value);
      if (!row.querySelector('[data-field="short"]').value) row.querySelector('[data-field="short"]').value = event.target.value;
    }
    if (event.target.dataset.field === "id") event.target.dataset.touched = "true";
  });
  $("#category-editor-list").addEventListener("click", event => {
    const button = event.target.closest("[data-category-action]");
    if (!button) return;
    categoryDraft = readCategoryRows();
    const row = button.closest(".category-editor-row");
    const index = [...$("#category-editor-list").children].indexOf(row);
    const action = button.dataset.categoryAction;
    if (action === "delete") {
      const originalId = categoryDraft[index].originalId;
      const used = catalog.products.find(product => product.category === originalId);
      if (used) return showToast(`Reasigna “${used.name}” antes de eliminar esta categoría.`, true);
      categoryDraft.splice(index, 1);
    } else {
      const target = action === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= categoryDraft.length) return;
      [categoryDraft[index], categoryDraft[target]] = [categoryDraft[target], categoryDraft[index]];
    }
    renderCategoryEditor();
  });
  $("#add-category").addEventListener("click", () => {
    categoryDraft = readCategoryRows();
    let id = "nueva-categoria";
    let suffix = 2;
    while (categoryDraft.some(category => category.id === id)) id = `nueva-categoria-${suffix++}`;
    categoryDraft.push({ originalId: "", id, name: "Nueva categoría", short: "Nueva", description: "Descripción de la nueva categoría.", color: "#B6D2EF", tone: "blue" });
    renderCategoryEditor();
    $("#category-editor-list").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#apply-categories").addEventListener("click", applyCategories);
  $("#price-editor-list").addEventListener("click", event => { if (event.target.closest("[data-repeat-delete]")) event.target.closest(".price-editor-row").remove(); });
  $("#faq-editor-list").addEventListener("click", event => { if (event.target.closest("[data-repeat-delete]")) event.target.closest(".faq-editor-row").remove(); });
  $("#add-price-row").addEventListener("click", () => $("#price-editor-list").insertAdjacentHTML("beforeend", priceRow({ category: "", product: "Nuevo precio", format: "Unidad", price: "A cotizar" })));
  $("#add-faq-row").addEventListener("click", () => $("#faq-editor-list").insertAdjacentHTML("beforeend", faqRow({ question: "Nueva pregunta", answer: "Respuesta" })));
  $("#apply-settings").addEventListener("click", applySettings);
  $("#save-catalog").addEventListener("click", saveCatalog);
  $("#regenerate-pdf").addEventListener("click", regeneratePdf);
  $("#logout").addEventListener("click", logout);
  $("#editor-product-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    if (!applyForm()) return;
    loadProduct(Number(button.dataset.index));
  });
  $("#editor-search").addEventListener("input", event => renderList(event.target.value));
  $("#product-form").addEventListener("input", () => setDirty(true));
  fields.image.addEventListener("input", updatePreview);
  fields.imageMode.addEventListener("change", updatePreview);
  fields.imagePosition.addEventListener("input", updatePreview);
  fields.name.addEventListener("input", () => {
    if (!fields.id.dataset.touched) fields.id.value = slug(fields.name.value);
    $("#editor-title").textContent = fields.name.value || "Editar producto";
  });
  fields.id.addEventListener("input", () => { fields.id.dataset.touched = "true"; });
  $("#upload-image").addEventListener("change", event => uploadImage(event.target.files[0]));
  $("#new-product").addEventListener("click", newProduct);
  $("#duplicate-product").addEventListener("click", () => {
    if (!applyForm()) return;
    const copy = structuredClone(catalog.products[currentIndex]);
    copy.name += " — copia";
    copy.id = uniqueProductId(`${copy.id}-copia`);
    catalog.products.splice(currentIndex + 1, 0, copy);
    setDirty(true);
    loadProduct(currentIndex + 1);
  });
  $("#delete-product").addEventListener("click", () => {
    if (catalog.products.length <= 1) return showToast("El catálogo debe conservar al menos un producto.", true);
    if (!confirm(`¿Eliminar “${catalog.products[currentIndex].name}”? Esta acción se aplicará al guardar.`)) return;
    catalog.products.splice(currentIndex, 1);
    setDirty(true);
    loadProduct(Math.max(0, currentIndex - 1));
  });
  $("#move-up").addEventListener("click", () => moveProduct(-1));
  $("#move-down").addEventListener("click", () => moveProduct(1));
  $("#export-json").addEventListener("click", () => {
    if (!applyForm()) return;
    download(`vestalia-catalogo-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(catalog, null, 2) + "\n");
  });
  $("#import-trigger").addEventListener("click", () => $("#import-json").click());
  $("#import-json").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.products) || !Array.isArray(imported.categories) || !imported.meta) throw new Error("El archivo no contiene un catálogo Vestalia válido.");
      catalog = imported;
      currentIndex = 0;
      renderCategories();
      loadProduct(0);
      setDirty(true);
      showToast("Respaldo importado. Revisa y guarda para publicarlo.");
    } catch (error) {
      showToast(error.message || "El archivo no contiene JSON válido.", true);
    } finally {
      event.target.value = "";
    }
  });
  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCatalog();
    }
  });

  initialize();
})();
