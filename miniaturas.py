#!/usr/bin/env python3
"""Genera miniaturas WebP livianas para las tarjetas del catálogo."""

from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = ImageOps = None

ROOT = Path(__file__).resolve().parent
THUMB_DIR = ROOT / "assets" / "thumbs"


def thumbnail_path(source_path: str) -> Path:
    return THUMB_DIR / f"{Path(source_path).stem}.webp"


def generate_thumbnail(source_path: str, force: bool = False) -> str:
    source = ROOT / source_path
    target = thumbnail_path(source_path)
    if Image is None or not source.is_file():
        return source_path
    if not force and target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return target.relative_to(ROOT).as_posix()
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((720, 720), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(target, "WEBP", quality=78, method=6)
    return target.relative_to(ROOT).as_posix()


def generate_all(paths: Iterable[str]) -> int:
    generated = 0
    for path in dict.fromkeys(paths):
        generate_thumbnail(path)
        generated += 1
    return generated


if __name__ == "__main__":
    from sync_catalogo import load_catalog
    catalog = load_catalog()
    count = generate_all(product["image"] for product in catalog["products"])
    print(f"Miniaturas listas: {count}.")
