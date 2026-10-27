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


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "keyframes":
        keyframes()
    else:
        print(__doc__)
