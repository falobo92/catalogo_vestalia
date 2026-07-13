import fs from "node:fs";

const source = JSON.parse(fs.readFileSync("data/catalogo.json", "utf8"));
const catalog = structuredClone(source);
const colors = ["#8ED9E3", "#9BCAC2", "#A9DCE3", "#B7D7D2", "#79C4D1", "#A7D2CC", "#B9E4E7", "#82BFCB", "#C4E3E1"];
const tones = ["blue", "sage", "blue", "sage", "blue", "sage", "blue", "sage", "blue"];

Object.assign(catalog.meta, {
  channel: "personas",
  audience: "personas",
  theme: "personas",
  draft: false,
  title: "Catálogo para personas",
  subtitle: "Panadería, pastelería y cocina para disfrutar en casa",
  heroLede: "Una colección artesanal para compartir, regalar o disfrutar en casa.",
  edition: "Edición personas",
  taxNote: "Precios finales. IVA incluido.",
  priceLabel: "Precio final",
  introKicker: "Una colección para disfrutar en casa",
  introTitle: "un pequeño gusto.",
  introBottom: "Algo rico para cada momento.",
  businessTitle: "Precios para personas",
  deliveryTimeValue: "Por definir",
  deliveryTimeLabel: "plazo de entrega",
  deliveryCostValue: "Por definir",
  deliveryCostLabel: "despacho",
  invoiceValue: "Compra",
  invoiceLabel: "directa",
  taxValue: "IVA",
  taxLabel: "incluido",
  contactEyebrow: "Pedidos personales",
  contactTitle: "¿Qué quieres disfrutar hoy?",
  contactText: "Consulta productos, formatos, disponibilidad y coordinación de entrega.",
  mobilePriceTitle: "Precios claros para elegir tu favorito."
});

catalog.meta.intro = "Vestalia transforma lo cotidiano en un pequeño ritual de bienestar. Esta colección para personas reúne galletas, panes, tortas, chocolatería y bocados dulces: productos artesanales, luminosos y hechos con cuidado.";

catalog.categories.forEach((category, index) => {
  category.color = colors[index % colors.length];
  category.tone = tones[index % tones.length];
});
catalog.products.forEach(product => { product.price = "Por definir"; });
const miniCookies = catalog.products.find(product => product.id === "mini-cookies");
if (miniCookies) miniCookies.eyebrow = "Formato para compartir";
const pan = catalog.products.find(product => product.id === "pan-artesanal-molde");
if (pan) {
  pan.tags = ["Miga tierna", "Corteza dorada", "Para compartir"];
  pan.insert = "Recomendado para desayunos, brunch, tostadas y sándwiches en casa.";
}
catalog.prices.forEach(row => { row.price = "Por definir"; });
catalog.faq = [
  { question: "¿Los precios incluyen IVA?", answer: "Sí. Todos los precios publicados en este catálogo incluyen IVA." },
  { question: "¿Cómo hago un pedido?", answer: "Escríbenos por WhatsApp indicando los productos y cantidades que deseas." },
  { question: "¿Qué medios de pago reciben?", answer: "Las alternativas de pago se confirmarán al coordinar tu pedido." },
  { question: "¿Cómo se coordina la entrega?", answer: "La disponibilidad, plazo y costo de entrega se confirman antes del pago." }
];
catalog.contact.genericMessage = "Hola Vestalia, quisiera información sobre el catálogo para personas.";
catalog.contact.productMessage = "Hola Vestalia, quisiera comprar {producto} ({formato}).";

const json = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync("data/catalogo-personas.json", json);
fs.writeFileSync("data/catalog-personas-data.js", `// Archivo generado desde data/catalogo-personas.json. No editar manualmente.\nwindow.VESTALIA_DATA_PERSONAS = ${JSON.stringify(catalog, null, 2)};\n`);
console.log(`Catálogo Personas creado con ${catalog.products.length} productos y precios por definir.`);
