#!/usr/bin/env python3
"""Draw the PWA icons (192 and 512 PNG) with the standard library only.

The favicon.ico in `web/public` was hand-rolled the same way: a tiny RGBA
scanline buffer plus zlib. No Pillow, no npm dependency, and the output is
byte-stable, so a rebuild never churns the repository.

The picture is a boat over the water in the game palette: hull #e0672f, sail
#e4ede6, mast and horizon #c9b083, sea #1b4a54, crests #24616c, sky #0f2a30.
It is rendered once at 1536px and box-filtered down to 512 and 192, which
gives clean edges without a drawing library.

Run: python3 web/scripts/make-icons.py
"""

import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
SUPER = 1536

SKY = (15, 42, 48)
SEA = (27, 74, 84)
CREST = (36, 97, 108)
SAND = (201, 176, 131)
HULL = (224, 103, 47)
SAIL = (228, 237, 230)


def in_triangle(u, v, a, b, c):
    """Barycentric sign test, points given as (u, v)."""
    def side(p, q):
        return (q[0] - p[0]) * (v - p[1]) - (q[1] - p[1]) * (u - p[0])
    d1, d2, d3 = side(a, b), side(b, c), side(c, a)
    return (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0)


def boat(u, v):
    """The sail, the mast and the hull; None when the pixel is water or sky."""
    if in_triangle(u, v, (0.520, 0.180), (0.520, 0.490), (0.725, 0.490)):
        return SAIL
    if in_triangle(u, v, (0.478, 0.250), (0.470, 0.490), (0.300, 0.490)):
        return SAIL
    if 0.492 <= u <= 0.512 and 0.170 <= v <= 0.505:
        return SAND
    if 0.505 <= v <= 0.600:
        half = 0.235 - (v - 0.505) * 0.55
        if abs(u - 0.5) <= half:
            return HULL
    return None


def crest(u, v):
    """Sea, plus two wave lines that drift with u so the sea is not a flat band."""
    phase = 0.030 * math.sin((u * 3.4 - 0.35) * math.pi)
    if 0.700 + phase < v < 0.712 + phase:
        return CREST
    if 0.10 < u < 0.68 and 0.765 + phase < v < 0.777 + phase:
        return CREST
    return SEA


def shade(u, v):
    """Colour of one sample, in palette order: sky, horizon, sea, crest, boat."""
    if v > 0.645:
        return crest(u, v)
    if 0.632 <= v <= 0.648:
        return SAND
    return boat(u, v) or SKY
    if 0.632 <= v <= 0.648:
        return SAND
    return boat(u, v) or SKY


def render(size):
    """RGBA rows for one icon, supersampled then box-filtered."""
    step = SUPER // size
    area = step * step
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = 0
            for sy in range(step):
                v = (y * step + sy + 0.5) / SUPER
                for sx in range(step):
                    u = (x * step + sx + 0.5) / SUPER
                    pr, pg, pb = shade(u, v)
                    r += pr
                    g += pg
                    b += pb
            row += bytes((r // area, g // area, b // area, 255))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    """Minimal RGBA PNG: signature, IHDR, IDAT, IEND."""
    raw = b"".join(b"\x00" + row for row in rows)
    def chunk(tag, data):
        body = tag + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(blob)
    return len(blob)


def main():
    for size in (192, 512):
        path = os.path.join(OUT, "icon-{}.png".format(size))
        written = write_png(path, render(size), size)
        print("{} {}x{} {} bytes".format(path, size, size, written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
