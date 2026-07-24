"""Generate binary app icons from the site mark design.

Outputs (Next.js App Router file conventions, see app/favicon.ico / icon.svg):
  - app/favicon.ico      multi-size ICO (16/24/32/48/64/128/256)
  - app/apple-icon.png   180x180 Apple touch icon

The vector source of truth is app/icon.svg (mirrored by components/SiteMark.tsx):
a solid rounded square in zinc-900 with three hollow option bubbles and the
bottom-right filled-and-ticked bubble punched out (transparent knock-outs).
Run from anywhere:  python scripts/generate_icons.py
Requires: Pillow
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"

S = 16  # supersample scale: 64 * 16 = 1024 canvas
CANVAS = 64 * S

# Palette (keep in sync with app/icon.svg)
INK = (24, 24, 27)  # #18181b zinc-900 — the only colour; knock-outs are transparent


def build_mark():
    """Render the mark at 1024x1024 RGBA with supersampled anti-aliasing."""
    # Solid tile.
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle(
        [0, 0, CANVAS - 1, CANVAS - 1], radius=14 * S, fill=INK + (255,)
    )

    # Punch out three hollow bubbles + the selected-bubble seat (bottom-right).
    hole = Image.new("L", (CANVAS, CANVAS), 0)
    hd = ImageDraw.Draw(hole)
    stroke = int(3.6 * S)
    for cx, cy in ((22, 22), (42, 22), (22, 42)):
        r = int(7.5 * S)
        hd.ellipse(
            [cx * S - r, cy * S - r, cx * S + r, cy * S + r],
            outline=255,
            width=stroke,
        )
    sr = int(9.5 * S)
    sc = 42 * S
    hd.ellipse([sc - sr, sc - sr, sc + sr, sc + sr], fill=255)
    canvas.putalpha(ImageChops.subtract(canvas.split()[3], hole))

    # Selected bubble: filled circle with the tick punched out.
    sel = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(sel).ellipse([sc - sr, sc - sr, sc + sr, sc + sr], fill=INK + (255,))
    tick_hole = Image.new("L", (CANVAS, CANVAS), 0)
    td = ImageDraw.Draw(tick_hole)
    pts = [(37.2 * S, 42.8 * S), (40.8 * S, 46.4 * S), (47.6 * S, 37.8 * S)]
    w = int(3.6 * S)
    td.line(pts, fill=255, width=w, joint="curve")
    cap = w / 2
    for px, py in (pts[0], pts[-1]):  # round line caps
        td.ellipse([px - cap, py - cap, px + cap, py + cap], fill=255)
    sel.putalpha(ImageChops.subtract(sel.split()[3], tick_hole))
    canvas.alpha_composite(sel)
    return canvas


def main():
    mark = build_mark()

    ico = APP / "favicon.ico"
    mark.save(ico, format="ICO",
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                     (64, 64), (128, 128), (256, 256)])
    print(f"wrote {ico}")

    apple = APP / "apple-icon.png"
    mark.resize((180, 180), Image.LANCZOS).save(apple, format="PNG")
    print(f"wrote {apple}")


if __name__ == "__main__":
    main()
