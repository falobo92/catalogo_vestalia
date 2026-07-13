#!/usr/bin/env python3
"""Genera el catálogo PDF desde la base de datos de Vestalia.

Flujo:
1. Construye `print-static.html` desde `data/catalogo.json`.
2. Usa WeasyPrint cuando está disponible.
3. Si WeasyPrint no está instalado, intenta Playwright/Chromium.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
STATIC_HTML = ROOT / "print-static.html"
OUTPUT = ROOT / "Vestalia_Catalogo_Cafeterias.pdf"

subprocess.run([sys.executable, str(ROOT / "build_print_static.py")], check=True)

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
except ImportError:
    sync_playwright = None

if sync_playwright is None:
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
        result = subprocess.run([node, str(node_script)], cwd=ROOT, env=environment)
        raise SystemExit(result.returncode)
    raise SystemExit(
        "Falta un motor PDF. Instala las dependencias con:\n"
        "  python -m pip install -r requirements.txt"
    )


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


@contextmanager
def local_server(directory: Path):
    handler = partial(QuietHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/print-static.html"
    finally:
        server.shutdown()
        thread.join(timeout=2)


chromium = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
with local_server(ROOT) as source, sync_playwright() as pw:
    launch_args = {"args": ["--no-sandbox"]}
    if chromium:
        launch_args["executable_path"] = chromium
    browser = pw.chromium.launch(**launch_args)
    page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=1)
    page.goto(source, wait_until="networkidle")
    page.wait_for_selector(".pdf-page")
    page.emulate_media(media="print")
    page.pdf(
        path=str(OUTPUT),
        format="A4",
        print_background=True,
        prefer_css_page_size=True,
        margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
    )
    browser.close()

print(OUTPUT)
