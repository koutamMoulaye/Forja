"""The README's screenshot and GIF, from the frames of apps/web/e2e/media.spec.ts.

    cd apps/web && pnpm exec playwright test --project media
    uv run --with pillow python scripts/docs_media.py

Writes docs/assets/canvas.png (the canvas of the demo project, an optimized palette PNG)
and docs/assets/journey.gif (the journey, scaled down, each frame shown for the time
the spec gave it).
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "apps" / "web" / "test-results" / "media"
ASSETS = ROOT / "docs" / "assets"
SCREENSHOT_WIDTH = 1440
GIF_WIDTH = 880
GIF_COLORS = 128


def screenshot() -> Path:
    image = Image.open(MEDIA / "canvas.png").convert("RGB")
    if image.width > SCREENSHOT_WIDTH:
        height = round(image.height * SCREENSHOT_WIDTH / image.width)
        image = image.resize((SCREENSHOT_WIDTH, height), Image.Resampling.LANCZOS)
    target = ASSETS / "canvas.png"
    image.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(target, optimize=True)
    return target


def journey() -> Path:
    frames = json.loads((MEDIA / "frames.json").read_text(encoding="utf-8"))
    images: list[Image.Image] = []
    durations: list[int] = []
    palette: Image.Image | None = None
    for frame in frames:
        image = Image.open(MEDIA / "frames" / frame["file"]).convert("RGB")
        height = round(image.height * GIF_WIDTH / image.width)
        image = image.resize((GIF_WIDTH, height), Image.Resampling.LANCZOS)
        # One palette for the whole film: no flicker between frames, smaller file.
        if palette is None:
            palette = image.quantize(colors=GIF_COLORS, method=Image.Quantize.MEDIANCUT)
        images.append(image.quantize(palette=palette, dither=Image.Dither.NONE))
        durations.append(int(frame["ms"]))
    target = ASSETS / "journey.gif"
    images[0].save(
        target,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=1,
    )
    return target


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for path in (screenshot(), journey()):
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
