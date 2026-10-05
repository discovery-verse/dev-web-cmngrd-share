#!/usr/bin/env python3
"""Generate the PWA icon set (pure stdlib — no Pillow needed).

Motif: a cream doorway/arch on warm clay — "come on in". Regenerate with:
    python3 scripts/generate-icons.py
Note: src/app/icon.svg is deliberately avoided (Turbopack build panic).
"""
import math
import struct
import zlib
from pathlib import Path

CLAY = (168, 81, 46)
CLAY_DEEP = (140, 64, 35)
CREAM = (250, 247, 242)

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def smooth(sdf: float) -> float:
    """Signed distance (px, negative inside) -> coverage 0..1 with ~1px AA."""
    return max(0.0, min(1.0, 0.5 - sdf))


def rounded_rect_sdf(x, y, cx, cy, hw, hh, r):
    qx = abs(x - cx) - (hw - r)
    qy = abs(y - cy) - (hh - r)
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - r


def arch_sdf(x, y, s):
    """Door arch: semicircle on top of a rectangle. s = size of the canvas."""
    cx = s / 2
    r = 0.16 * s
    top_cy = 0.44 * s
    bottom = 0.74 * s
    # circle part
    d_circle = math.hypot(x - cx, y - top_cy) - r
    # rect part (from circle centre line down to `bottom`)
    d_rect = rounded_rect_sdf(x, y, cx, (top_cy + bottom) / 2, r, (bottom - top_cy) / 2, 0.02 * s)
    return min(d_circle, d_rect)


def make_icon(size: int, maskable: bool) -> bytes:
    corner = 0.0 if maskable else 0.22 * size
    motif_scale = 0.78 if maskable else 1.0
    rows = []
    for j in range(size):
        row = bytearray()
        for i in range(size):
            x, y = i + 0.5, j + 0.5
            # background: rounded square (or full bleed when maskable)
            if maskable:
                bg_cov = 1.0
            else:
                bg_cov = smooth(rounded_rect_sdf(x, y, size / 2, size / 2, size / 2, size / 2, corner))
            # subtle vertical gradient on the clay
            t = j / size
            bg = tuple(round(CLAY[k] * (1 - t) + CLAY_DEEP[k] * t) for k in range(3))
            # motif in canvas coords, scaled about the centre
            mx = (x - size / 2) / motif_scale + size / 2
            my = (y - size / 2) / motif_scale + size / 2
            arch_cov = smooth(arch_sdf(mx, my, size) * motif_scale)
            r = bg[0] + (CREAM[0] - bg[0]) * arch_cov
            g = bg[1] + (CREAM[1] - bg[1]) * arch_cov
            b = bg[2] + (CREAM[2] - bg[2]) * arch_cov
            a = round(255 * bg_cov)
            row += bytes((round(r), round(g), round(b), a))
        rows.append(bytes(row))
    return png_encode(size, size, rows)


def png_encode(w, h, rows):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

    raw = b"".join(b"\x00" + row for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon-512.png").write_bytes(make_icon(512, maskable=False))
    (OUT / "icon-192.png").write_bytes(make_icon(192, maskable=False))
    (OUT / "icon-maskable-512.png").write_bytes(make_icon(512, maskable=True))
    (OUT / "apple-touch-icon.png").write_bytes(make_icon(180, maskable=True))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
