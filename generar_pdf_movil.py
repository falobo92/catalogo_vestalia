#!/usr/bin/env python3
"""Genera el catálogo Vestalia 9:16 para lectura en teléfonos."""

from pathlib import Path
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
STATIC_HTML = ROOT / "mobile-print-static.html"
OUTPUT = ROOT / "Vestalia_Catalogo_Movil.pdf"

# El constructor A4 prepara también los recortes transparentes optimizados.
subprocess.run([sys.executable, str(ROOT / "build_print_static.py")], check=True)
subprocess.run([sys.executable, str(ROOT / "build_mobile_static.py")], check=True)

try:
    from weasyprint import HTML
except (ImportError, OSError) as error:
    HTML = None
    print(f"WeasyPrint no disponible; se intentara Playwright: {error}", file=sys.stderr)

if HTML is not None:
    try:
        HTML(filename=str(STATIC_HTML), base_url=str(ROOT)).write_pdf(str(OUTPUT))
    except Exception as error:
        print(f"WeasyPrint fallo; se intentara Playwright: {error}", file=sys.stderr)
    else:
        print(OUTPUT)
        raise SystemExit(0)

try:
    from playwright.sync_api import sync_playwright
except ImportError as error:
    sync_playwright = None
    playwright_error = error
else:
    playwright_error = None

if sync_playwright is not None:
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    viewport={"width": 1280, "height": 900},
                    device_scale_factor=1,
                )
                page.goto(STATIC_HTML.as_uri(), wait_until="networkidle")
                page.wait_for_selector(".mobile-page")
                page.emulate_media(media="print")
                page.pdf(
                    path=str(OUTPUT),
                    format="A4",
                    print_background=True,
                    prefer_css_page_size=True,
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                )
            finally:
                browser.close()
    except Exception as error:
        playwright_error = error
        print(f"Playwright fallo; se intentara la alternativa Node: {error}", file=sys.stderr)
    else:
        print(OUTPUT)
        raise SystemExit(0)

node = shutil.which("node")
bundled_root = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies"
bundled_node = bundled_root / "node/bin/node"
if not node and bundled_node.is_file():
    node = str(bundled_node)
node_modules = bundled_root / "node/node_modules"
node_script = ROOT / "generar_pdf_node.js"

if node and node_script.is_file() and node_modules.is_dir():
    environment = os.environ.copy()
    environment["NODE_PATH"] = str(node_modules)
    chromium_candidates = sorted((Path.home() / ".cache/ms-playwright").glob("chromium-*/chrome-linux*/chrome"), reverse=True)
    if chromium_candidates:
        environment["VESTALIA_CHROMIUM"] = str(chromium_candidates[0])
    result = subprocess.run(
        [node, str(node_script), STATIC_HTML.name, OUTPUT.name, ".mobile-page"],
        cwd=ROOT,
        env=environment,
    )
    raise SystemExit(result.returncode)

raise SystemExit(
    "No se pudo iniciar ningun motor PDF.\n"
    f"Detalle de Playwright: {playwright_error}\n"
    "Ejecuta iniciar_catalogo.bat para instalar o reparar las dependencias."
)
