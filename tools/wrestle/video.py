"""
Smooth version of the home-page wrestlers: a generated video through the
drawings, turned into a scroll-scrubbed frame sequence.

  1. python3 tools/wrestle/video.py keyframes
       Lays every pose out where the men stand on the page, as black lines on
       white like the original drawings, on a 1920×1080 canvas, and writes them
       to tools/wrestle/keyframes/k00.png … plus layout.json (where the stage
       sits on that canvas). These are the start, middle and end frames given
       to the video model.

  2. Generate the video from those keyframes (Kling 4.0 image-to-video on fal,
     start + middle + end frames; the prompt used is in tools/wrestle/PROMPT.md)
     and save it as tools/wrestle/video/take.mp4.

  3. python3 tools/wrestle/video.py frames
       Pulls every frame out of the video, cleans each one into the same ivory
       line art as before, keeps the frames that carry the motion evenly (so the
       men move at an even pace as you scroll), and writes them to
       assets/img/wrestle/seq/ with seq.json for assets/js/lineart.js.
"""
import json, os, sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build  # noqa: E402

KEY_DIR = os.path.join(HERE, "keyframes")
CW, CH = 1920, 1080          # the video canvas (16:9)
# which beats from frames.json become keyframes, in order. The model takes a
# start, up to 8 middles and an end: 10 in all. Beat 8 (first contact, heads
# together, free hands open) is left out — between the tie-up and the lock
# it would make the heads touch, part and touch again.
KEY_BEATS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]


def keyframes():
    data = build.main()                       # rebuilds frames.json and keeps each pose's drawing
    R = build.RES
    sw, sh = data["w"] / R, data["h"] / R     # the stage at the drawings' own size
    scale = min(CW * 0.94 / sw, CH * 0.9 / sh)
    ox = (CW - sw * scale) / 2
    oy = (CH - sh * scale) / 2 + CH * 0.02    # a touch below centre: more room above the heads
    os.makedirs(KEY_DIR, exist_ok=True)
    for f in os.listdir(KEY_DIR):
        if f.endswith(".png"):
            os.remove(os.path.join(KEY_DIR, f))
    for k, bi in enumerate(KEY_BEATS):
        canvas = np.full((CH, CW), 255, np.uint8)
        for l in data["beats"][bi]:
            # levels: paper (≈253, not quite white) → pure white, lines → pure black,
            # so no faint box shows round each man for the model to animate
            crop = build.CROPS[l["id"]].astype(np.float32)
            crop = np.clip((crop - 20) * 255 / (225 - 20), 0, 255).astype(np.uint8)
            s = l["s"] * scale
            im = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            x = int(round(ox + l["x"] / R * scale))
            y = int(round(oy + l["y"] / R * scale))
            h, w = im.shape
            h, w = min(h, CH - y), min(w, CW - x)
            canvas[y:y + h, x:x + w] = np.minimum(canvas[y:y + h, x:x + w], im[:h, :w])
        cv2.imwrite(os.path.join(KEY_DIR, f"k{k:02d}.png"), canvas)
    layout = {"canvas": [CW, CH], "stage": [data["w"], data["h"]], "res": R,
              "scale": scale, "offset": [ox, oy], "beats": KEY_BEATS}
    with open(os.path.join(KEY_DIR, "layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(len(KEY_BEATS), "keyframes →", KEY_DIR, "· stage scale", round(scale, 3))


# ---- frames: the video → scroll frames --------------------------------------
VIDEO = os.path.join(HERE, "video", "take.mp4")
SEQ_DIR = os.path.join(build.ROOT, "assets", "img", "wrestle", "seq")
OUT_W = 1100                 # published frame width (px); the stage is shown at most ~750 css px wide
COUNT = 200                  # frames kept; the page blends between neighbours, so motion stays continuous
EVEN = 0.7                   # 1 = pace the frames purely by how much moves, 0 = by the video's own clock


def read_video(path):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY))
    cap.release()
    return frames, fps


def to_stage(g, layout):
    """The stage's part of a video frame, at the published size, with clean paper and ink."""
    ox, oy = layout["offset"]
    sc = layout["scale"]
    sw, sh = layout["stage"][0] / layout["res"], layout["stage"][1] / layout["res"]
    # the video may not be exactly 1920×1080; scale the canvas box to it
    fx, fy = g.shape[1] / layout["canvas"][0], g.shape[0] / layout["canvas"][1]
    x0, y0 = ox * fx, oy * fy
    x1, y1 = (ox + sw * sc) * fx, (oy + sh * sc) * fy
    out_h = round(OUT_W * (y1 - y0) / (x1 - x0))
    M = np.array([[OUT_W / (x1 - x0), 0, -x0 * OUT_W / (x1 - x0)],
                  [0, out_h / (y1 - y0), -y0 * out_h / (y1 - y0)]], np.float32)
    st = cv2.warpAffine(g, M, (OUT_W, out_h), flags=cv2.INTER_AREA, borderValue=255)
    return st


def ink_of(st):
    """Line strength 0–1 from a stage frame: paper → 0, ink → 1, compression haze removed."""
    v = st.astype(np.float32)
    paper = np.percentile(v, 60)                 # most of the frame is paper
    a = np.clip((paper - 12 - v) / 120, 0, 1)
    return a


def inside_of(a):
    """Where the bodies are: everything the outlines enclose, robust to small gaps in a line."""
    line = (a > 0.35).astype(np.uint8) * 255
    best = None
    for k in (5, 9, 15, 23):
        closed = cv2.morphologyEx(line, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        pad = cv2.copyMakeBorder(255 - closed, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
        mask = np.zeros((pad.shape[0] + 2, pad.shape[1] + 2), np.uint8)
        cv2.floodFill(pad, mask, (0, 0), 128)
        inside = (pad[1:-1, 1:-1] != 128).astype(np.uint8)
        best = inside
        # a whole body is far bigger than its outline; if the fill leaked out
        # through a gap, only the outline itself is left and we close harder
        if inside.sum() > 2.2 * (line > 0).sum():
            break
    return best.astype(np.float32)


FILL_SCALE = 0.25            # the body fill is a soft blob: a quarter of the size is plenty
FILL_PER_SHEET = 30          # fills packed into one image each, to keep requests down


def line_rgba(a):
    """The lines alone: one ivory colour, the shape carried in the alpha channel."""
    ink = build.INK[::-1]                                # BGR → RGB
    rgb = np.broadcast_to(ink, a.shape + (3,))
    return np.dstack([rgb, a * 255]).astype(np.uint8)


def fill_rgba(inside):
    """The dark fill inside the bodies, small. Pulled in 2px first so that, scaled
    back up, it stays under the outlines instead of spilling past them."""
    ins = cv2.erode(inside, np.ones((5, 5), np.uint8))
    ins = cv2.GaussianBlur(ins, (9, 9), 0)
    small = cv2.resize(ins, None, fx=FILL_SCALE, fy=FILL_SCALE, interpolation=cv2.INTER_AREA)
    rgb = np.broadcast_to(build.FILL[::-1], small.shape + (3,))
    return np.dstack([rgb, small * 255 * build.FILL_ALPHA]).astype(np.uint8)


def pick(motion, n):
    """n frame indices spread evenly over the motion (mixed with even time), always first and last."""
    m = np.asarray(motion, np.float64)
    cum = np.concatenate([[0], np.cumsum(m)])
    cum = cum / cum[-1] if cum[-1] > 0 else np.linspace(0, 1, len(cum))
    clock = np.linspace(0, 1, len(cum))
    pace = EVEN * cum + (1 - EVEN) * clock
    targets = np.linspace(0, 1, n)
    idx = np.searchsorted(pace, targets).clip(0, len(cum) - 1)
    idx[0], idx[-1] = 0, len(cum) - 1
    return sorted(set(int(i) for i in idx))


def frames(path=VIDEO):
    from PIL import Image
    with open(os.path.join(KEY_DIR, "layout.json")) as f:
        layout = json.load(f)
    raw, fps = read_video(path)
    if not raw:
        sys.exit("No frames in " + path)
    print(len(raw), "video frames at", round(fps, 2), "fps,", raw[0].shape[1], "×", raw[0].shape[0])
    inks = [ink_of(to_stage(g, layout)) for g in raw]
    # how much moves from one frame to the next (blurred, so a line shifting a
    # pixel counts less than a limb swinging through)
    small = [cv2.GaussianBlur(cv2.resize(a, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA), (5, 5), 0) for a in inks]
    motion = [float(np.abs(small[i] - small[i - 1]).mean()) for i in range(1, len(small))]
    keep = pick(motion, COUNT)
    os.makedirs(SEQ_DIR, exist_ok=True)
    for f in os.listdir(SEQ_DIR):
        os.remove(os.path.join(SEQ_DIR, f))
    names, fills, total = [], [], 0
    for n, i in enumerate(keep):
        a = inks[i]
        name = f"{n:03d}.webp"
        Image.fromarray(line_rgba(a)).save(os.path.join(SEQ_DIR, name), "WEBP", quality=70, alpha_quality=55, method=6)
        total += os.path.getsize(os.path.join(SEQ_DIR, name))
        names.append(name)
        fills.append(fill_rgba(inside_of(a)))
    # pack the fills into sheets, FILL_PER_SHEET each, in a grid
    fh, fw = fills[0].shape[:2]
    cols = 6
    sheets = []
    for s0 in range(0, len(fills), FILL_PER_SHEET):
        group = fills[s0:s0 + FILL_PER_SHEET]
        rows = -(-len(group) // cols)
        sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
        for j, f in enumerate(group):
            r, c = divmod(j, cols)
            sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = f
        sname = f"fill-{len(sheets)}.webp"
        Image.fromarray(sheet).save(os.path.join(SEQ_DIR, sname), "WEBP", quality=70, alpha_quality=70, method=6)
        total += os.path.getsize(os.path.join(SEQ_DIR, sname))
        sheets.append(sname)
    h, w = inks[0].shape
    with open(os.path.join(SEQ_DIR, "seq.json"), "w") as f:
        json.dump({"w": w, "h": h, "frames": names,
                   "fill": {"sheets": sheets, "per": FILL_PER_SHEET, "cols": cols, "w": fw, "h": fh},
                   "source": {"frames": len(raw), "fps": fps, "kept": keep}}, f)
    print(len(names), "frames →", SEQ_DIR, f"· {total / 1e6:.2f} MB in all, {total / len(names) / 1e3:.0f} KB a frame")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "keyframes":
        keyframes()
    elif cmd == "frames":
        frames(sys.argv[2] if len(sys.argv) > 2 else VIDEO)
    else:
        print(__doc__)
