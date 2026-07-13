#!/usr/bin/env node
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

(async () => {
  const root = __dirname;
  const inputName = process.argv[2] || "print-static.html";
  const outputName = process.argv[3] || "Vestalia_Catalogo_Cafeterias.pdf";
  const selector = process.argv[4] || ".pdf-page";
  const source = pathToFileURL(path.join(root, inputName)).href;
  const output = path.join(root, outputName);
  const options = { headless: true };
  if (process.env.VESTALIA_CHROMIUM) options.executablePath = process.env.VESTALIA_CHROMIUM;
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(source, { waitUntil: "networkidle" });
    await page.waitForSelector(selector);
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: output,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
  } finally {
    await browser.close();
  }
  process.stdout.write(`${output}\n`);
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
