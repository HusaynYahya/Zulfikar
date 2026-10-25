"""
Build the home-page wrestling frames from the nine line drawings in raw/.

    python3 tools/wrestle/build.py          (from the repository root)

raw/1.png … raw/9.png are the drawings in action order:
  1 apart in stance   2 stepping in   3 stepping in, closer   4 stance, closer
  5 reaching          6 hand fight    7 first contact         8 tie-up   9 locked

What it does:
  • puts back the hairline and ear on the heads that were drawn without them
    (both men in frame 7, the man in the t-shirt in frame 9), copied from
    frame 4 and fitted to each head;
  • cuts each man out of frames 1–5, so the two can step in independently;
  • scales every frame to the same body size and puts every foot on one
    ground line;
  • chains the steps so a planted foot never slides: a step keeps the back
    foot where it was, and the stance after it keeps the front foot where it
    landed;
  • writes ivory line art (with a soft dark fill inside each body, so the
    figures read clearly over the scenery) to assets/img/wrestle/, plus
    frames.json, which says where each layer sits in every beat.
"""
import json, os
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "img", "wrestle")
W, H = 1536, 1024
GROUND = 922                                   # every foot ends up on this line
INK = np.array([210, 230, 239], np.float32)    # ivory lines (BGR) — #efe6d2
FILL = np.array([25, 17, 13], np.float32)      # dark navy inside the bodies (BGR) — #0d1119
FILL_ALPHA = 0.68
LINE_GROW = 3                                  # thicken the drawn lines a touch so they hold up on a phone (px)
RES = 0.75                                     # published size relative to the drawings; plenty for a retina screen
# frames 6–9 were drawn a little closer to the camera; this brings the men
# back to the size they are in frames 1–5 (measured from shoe length and head width)
SCALE = {6: 0.965, 7: 0.935, 8: 0.935, 9: 0.935}


def load(i):
    return cv2.imread(os.path.join(HERE, "raw", f"{i}.png"), cv2.IMREAD_GRAYSCALE)


# ---- 1. heads drawn without a hairline -------------------------------------
def similarity(p, q, P, Q):
    """The rotation + scale + shift that takes points p, q to P, Q."""
    p, q, P, Q = [np.array(v, float) for v in (p, q, P, Q)]
    v, V = q - p, Q - P
    s = np.linalg.norm(V) / np.linalg.norm(v)
    a = np.arctan2(V[1], V[0]) - np.arctan2(v[1], v[0])
    M = np.array([[s * np.cos(a), -s * np.sin(a), 0], [s * np.sin(a), s * np.cos(a), 0]])
    M[:, 2] = P - M[:, :2] @ p
    return M


# The hairline and ear of each man in frame 4, traced as a path (so only that
# line is picked up), from the back of the head to the forehead.
HAIRLINE = {
    "A": [(505, 151), (515, 148), (530, 138), (540, 128), (550, 128), (560, 145), (570, 128), (583, 108), (605, 109)],
    "B": [(1022, 157), (1010, 150), (995, 138), (980, 128), (970, 128), (960, 148), (952, 130), (930, 110), (895, 110)],
}
# where that line belongs on each head that is missing it: back of head, forehead
HEAD_FIXES = {7: [("A", (596, 142), (716, 101)), ("B", (884, 140), (758, 105))],
              9: [("A", (654, 141), (736, 100))]}


def fix_heads(i, g):
    if i not in HEAD_FIXES:
        return g
    src = load(4)
    g = g.copy()
    for who, back, front in HEAD_FIXES[i]:
        pts = HAIRLINE[who]
        band = np.zeros_like(src)
        cv2.polylines(band, [np.array(pts, np.int32)], False, 255, 18)
        line = np.where((src < 150) & (band > 0), 255, 0).astype(np.uint8)
        M = similarity(pts[0], pts[-1], back, front)
        moved = cv2.warpAffine(line, M, (W, H), flags=cv2.INTER_LINEAR)
        moved = cv2.dilate(np.where(moved > 110, 255, 0).astype(np.uint8), np.ones((2, 2), np.uint8))
        moved = cv2.GaussianBlur(moved, (3, 3), 0)
        g = np.minimum(g, 255 - moved)
    return g


# ---- 2. measuring ------------------------------------------------------------
def split_column(g):
    """The empty column between the two men, when they aren't touching."""
    col = (g < 140).sum(0)
    empty = [x for x in range(500, 1050) if col[x] == 0]
    return (empty[0] + empty[-1]) // 2 if empty else None


def feet(g, x0, x1):
    """Centres of the two shoes (left one first) and the lowest ink row."""
    ink = g[:, x0:x1] < 140
    ys, xs = np.nonzero(ink)
    top, bot = ys.min(), ys.max()
    fx = np.sort(xs[ys > bot - (bot - top) * 0.07] + x0)
    groups = [c for c in np.split(fx, np.where(np.diff(fx) > 25)[0] + 1) if len(c) > 20]
    groups.sort(key=len, reverse=True)
    cs = sorted(float((c.min() + c.max()) / 2) for c in groups[:2])
    return cs, int(bot)


# ---- 3. drawing the layers ---------------------------------------------------
def layer(g, x0, y0, x1, y1, name):
    """Ivory line art of g[y0:y1, x0:x1] with a soft fill inside the bodies."""
    crop = cv2.erode(g[y0:y1, x0:x1], np.ones((LINE_GROW, LINE_GROW), np.uint8))
    dark = 255 - crop.astype(np.float32)
    line_a = np.clip((dark - 40) / 160, 0, 1)
    # outside = white reachable from the edge of the crop
    white = np.where(crop > 150, 255, 0).astype(np.uint8)
    pad = cv2.copyMakeBorder(white, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    mask = np.zeros((pad.shape[0] + 2, pad.shape[1] + 2), np.uint8)
    cv2.floodFill(pad, mask, (0, 0), 128)
    inside = (pad[1:-1, 1:-1] != 128).astype(np.float32)
    inside = cv2.GaussianBlur(inside, (5, 5), 0)
    fill_a = inside * FILL_ALPHA
    a = np.maximum(line_a, fill_a)
    rgb = (INK * line_a[..., None] + FILL * (1 - line_a[..., None]) * fill_a[..., None]) / np.maximum(a[..., None], 1e-6)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    w, h = round((x1 - x0) * RES), round((y1 - y0) * RES)
    out = cv2.resize(out, (w, h), interpolation=cv2.INTER_AREA)
    rgba = cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA)
    Image.fromarray(rgba).save(os.path.join(OUT, name + ".webp"), "WEBP", quality=80, alpha_quality=70, method=6)
    return {"src": name + ".webp", "w": int(w), "h": int(h)}


def bbox(g, x0, x1, pad=10):
    ys, xs = np.nonzero(g[:, x0:x1] < 140)
    return (max(0, xs.min() + x0 - pad), max(0, ys.min() - pad), min(W, xs.max() + x0 + pad), min(H, ys.max() + pad))


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".webp"):
            os.remove(os.path.join(OUT, f))
    layers, men, pairs = {}, {}, {}

    for i in range(1, 10):
        g = fix_heads(i, load(i))
        split = split_column(g) if i <= 5 else None
        if split:
            for who, (x0, x1) in (("A", (0, split)), ("B", (split, W))):
                bx0, by0, bx1, by1 = bbox(g, x0, x1)
                (left, right), bot = feet(g, x0, x1)
                name = f"{who.lower()}{i}"
                layers[name] = layer(g, bx0, by0, bx1, by1, name)
                # A faces right, so his front foot is the right one; B the opposite
                front, rear = (right, left) if who == "A" else (left, right)
                men[name] = {"ox": bx0, "oy": by0, "front": front, "rear": rear, "dy": GROUND - bot}
        else:
            bx0, by0, bx1, by1 = bbox(g, 0, W)
            fa, bot_a = feet(g, 0, W // 2)
            fb, bot_b = feet(g, W // 2, W)
            ar, bl = fa[-1], fb[0]          # the two front feet, nearest the middle
            bot = max(bot_a, bot_b)
            s = SCALE.get(i, 1.0)
            name = f"p{i}"
            layers[name] = layer(g, bx0, by0, bx1, by1, name)
            X = lambda x: 768 + (x - 768) * s
            pairs[name] = {"x": X(bx0), "y": GROUND + (by0 - bot) * s, "s": s,
                           "a_front": X(ar), "b_front": X(bl)}

    # ---- 4. chain the steps --------------------------------------------------
    # pose order for each man, and which foot stays planted coming into it
    seq = [(1, None), (2, "rear"), (4, "front"), (3, "rear"), (4, "front"), (5, "front")]

    def chain(who, end_front):
        xs, cur = [], 0.0
        for k, (i, keep) in enumerate(seq):
            m = men[f"{who}{i}"]
            if keep:
                prev_i = seq[k - 1][0]
                pm = men[f"{who}{prev_i}"]
                cur = (pm[keep] + xs[-1]) - m[keep]
            xs.append(cur)
        # shift the whole walk so the reach ends just short of the hand fight
        last = men[f"{who}{seq[-1][0]}"]
        shift = end_front - (last["front"] + xs[-1])
        return [x + shift for x in xs]

    gap = 16
    ax = chain("a", pairs["p6"]["a_front"] - gap)
    bx = chain("b", pairs["p6"]["b_front"] + gap)

    def man(who, k, xs):
        i = seq[k][0]
        m = men[f"{who}{i}"]
        return {"id": f"{who}{i}", "x": m["ox"] + xs[k], "y": m["oy"] + m["dy"], "s": 1}

    def pair(name):
        p = pairs[name]
        return {"id": name, "x": p["x"], "y": p["y"], "s": p["s"]}

    # A and B take turns to step, so they don't move in lockstep
    order = [(0, 0), (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (5, 5)]
    beats = [[man("a", a, ax), man("b", b, bx)] for a, b in order]
    beats += [[pair(n)] for n in ("p6", "p7", "p8", "p9")]

    # ---- 5. the stage that holds every beat ------------------------------------
    x0 = min(l["x"] for b in beats for l in b)
    y0 = min(l["y"] for b in beats for l in b)
    x1 = max(l["x"] + layers[l["id"]]["w"] / RES * l["s"] for b in beats for l in b)
    y1 = max(l["y"] + layers[l["id"]]["h"] / RES * l["s"] for b in beats for l in b)
    m = 12
    for b in beats:
        for l in b:
            l["x"] = round(float(l["x"] - x0 + m) * RES, 1)
            l["y"] = round(float(l["y"] - y0 + m) * RES, 1)
            l["s"] = round(float(l["s"]), 4)
    data = {"w": int(round((x1 - x0 + 2 * m) * RES)), "h": int(round((y1 - y0 + 2 * m) * RES)), "layers": layers, "beats": beats}
    with open(os.path.join(OUT, "frames.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("stage", data["w"], "x", data["h"], "·", len(beats), "beats ·", len(layers), "layers")


if __name__ == "__main__":
    main()
