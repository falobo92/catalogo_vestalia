#!/usr/bin/env python3
"""Servidor editorial local de Vestalia.

Sirve el catálogo y permite que editor.html guarde el JSON maestro y suba imágenes
sin instalar frameworks ni servicios externos.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
import socket
import subprocess
import sys
import threading
import unicodedata
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from sync_catalogo import CatalogError, JSON_PATH, ROOT, load_catalog, write_catalog, write_js_fallback
from miniaturas import generate_all, generate_thumbnail

MAX_CATALOG_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}


def rebuild_print_static() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "build_print_static.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Error desconocido."
        raise CatalogError(f"Los datos se guardaron, pero no se pudo reconstruir print-static.html: {detail}")


def rebuild_pdf() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "generar_pdf.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Error desconocido."
        raise CatalogError(f"No se pudo reconstruir el PDF: {detail}")


def rebuild_mobile_pdf() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "generar_pdf_movil.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Error desconocido."
        raise CatalogError(f"No se pudo reconstruir el PDF móvil: {detail}")


def safe_filename(name: str) -> str:
    source = Path(name).name
    stem = unicodedata.normalize("NFKD", Path(source).stem).encode("ascii", "ignore").decode("ascii")
    stem = re.sub(r"[^a-zA-Z0-9]+", "-", stem).strip("-").lower() or "producto"
    extension = Path(source).suffix.lower()
    if extension not in IMAGE_EXTENSIONS:
        raise CatalogError("Formato de imagen no admitido. Usa JPG, PNG, WebP o AVIF.")
    return f"{stem}{extension}"


class VestaliaHandler(SimpleHTTPRequestHandler):
    server_version = "VestaliaCatalog/2.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, message: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {message % args}")

    def json_response(self, payload: object, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        route = urlparse(self.path)
        if route.path == "/api/catalogo":
            try:
                self.json_response(load_catalog())
            except CatalogError as error:
                self.json_response({"ok": False, "error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if route.path == "/api/estado":
            self.json_response({"ok": True, "mode": "editorial"})
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = urlparse(self.path)
        if route.path == "/api/catalogo":
            self.save_catalog()
            return
        if route.path == "/api/imagenes":
            self.save_image(route.query)
            return
        self.json_response({"ok": False, "error": "Ruta no encontrada."}, HTTPStatus.NOT_FOUND)

    def read_body(self, maximum: int) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise CatalogError("Tamaño de solicitud inválido.") from error
        if length <= 0 or length > maximum:
            raise CatalogError(f"El archivo supera el límite permitido de {maximum // (1024 * 1024)} MB.")
        return self.rfile.read(length)

    def save_catalog(self) -> None:
        artifact_paths = (
            JSON_PATH,
            ROOT / "data" / "catalog-data.js",
            ROOT / "print-static.html",
            ROOT / "Vestalia_Catalogo_Cafeterias.pdf",
            ROOT / "mobile-print-static.html",
            ROOT / "Vestalia_Catalogo_Movil.pdf",
        )
        previous = {path: path.read_bytes() if path.exists() else None for path in artifact_paths}
        try:
            body = self.read_body(MAX_CATALOG_BYTES)
            catalog = json.loads(body.decode("utf-8"))
            write_catalog(catalog)
            rebuild_pdf()
            rebuild_mobile_pdf()
            self.json_response({"ok": True, "products": len(catalog["products"]), "printStatic": True, "pdf": True, "mobilePdf": True})
        except (CatalogError, UnicodeDecodeError, json.JSONDecodeError) as error:
            for path, content in previous.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(content)
            self.json_response({"ok": False, "error": str(error)}, HTTPStatus.BAD_REQUEST)
        except OSError as error:
            for path, content in previous.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(content)
            self.json_response({"ok": False, "error": f"No se pudo guardar: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def save_image(self, query: str) -> None:
        try:
            requested = parse_qs(query).get("nombre", [""])[0]
            filename = safe_filename(requested)
            content = self.read_body(MAX_IMAGE_BYTES)
            image_dir = ROOT / "assets" / "images"
            target = image_dir / filename
            suffix = 2
            while target.exists():
                target = image_dir / f"{Path(filename).stem}-{suffix}{Path(filename).suffix}"
                suffix += 1
            target.write_bytes(content)
            generate_thumbnail(target.relative_to(ROOT).as_posix(), force=True)
            mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self.json_response({"ok": True, "path": f"assets/images/{target.name}", "type": mime})
        except CatalogError as error:
            self.json_response({"ok": False, "error": str(error)}, HTTPStatus.BAD_REQUEST)
        except OSError as error:
            self.json_response({"ok": False, "error": f"No se pudo guardar la imagen: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


class VestaliaServer(ThreadingHTTPServer):
    """Servidor local con reserva exclusiva del puerto en Windows."""

    allow_reuse_address = False

    def server_bind(self) -> None:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main() -> None:
    parser = argparse.ArgumentParser(description="Servidor editorial local de Vestalia")
    parser.add_argument("--port", type=int, default=8080, help="Puerto local (por defecto: 8080)")
    parser.add_argument("--no-browser", action="store_true", help="No abrir el navegador automáticamente")
    args = parser.parse_args()

    try:
        server = VestaliaServer(("127.0.0.1", args.port), VestaliaHandler)
    except OSError as error:
        if getattr(error, "winerror", None) == 10048 or error.errno in {48, 98}:
            raise SystemExit(
                f"El puerto {args.port} ya esta ocupado. "
                "Cierra la otra instancia de Vestalia o la aplicacion que lo esta usando."
            ) from None
        raise

    try:
        catalog = load_catalog()
        write_js_fallback(catalog)
        generate_all(product["image"] for product in catalog["products"])
        rebuild_pdf()
        rebuild_mobile_pdf()
    except Exception:
        server.server_close()
        raise

    url = f"http://127.0.0.1:{args.port}/editor.html"
    print(f"\nVestalia está listo: {url}")
    print("Presiona Ctrl+C para cerrar.\n")
    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor cerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
