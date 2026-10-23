"""Make harder versions of the sample reports: blur, motion blur, low resolution, JPEG, dark, tilt, perspective, shadow, noise."""
import cv2, numpy as np, sys
from pathlib import Path
D = Path(__file__).parent
SRC = D.parent.parent / "samples" / "monthly"
rng = np.random.default_rng(0)

def gblur(im, s): return cv2.GaussianBlur(im, (0, 0), s)
def motion(im, n, ang=20):
    k = np.zeros((n, n), np.float32); k[n // 2, :] = 1
    k = cv2.warpAffine(k, cv2.getRotationMatrix2D((n / 2 - .5, n / 2 - .5), ang, 1), (n, n)); k /= k.sum()
    return cv2.filter2D(im, -1, k)
def lowres(im, f):
    h, w = im.shape[:2]; return cv2.resize(im, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
def jpeg(im, q):
    ok, b = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, q]); return cv2.imdecode(b, 1)
def dark(im, g): return np.clip(im.astype(np.float32) * g + 10, 0, 255).astype(np.uint8)
def rotate(im, a):
    h, w = im.shape[:2]; M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1)
    return cv2.warpAffine(im, M, (w, h), borderValue=(90, 90, 90))
def persp(im, k):
    h, w = im.shape[:2]; pad = 120
    big = cv2.copyMakeBorder(im, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(70, 60, 50))
    H, W = big.shape[:2]
    src = np.float32([[pad, pad], [W - pad, pad], [W - pad, H - pad], [pad, H - pad]])
    dst = np.float32([[pad + k * w, pad + k * .3 * h], [W - pad - k * .2 * w, pad], [W - pad, H - pad - k * .2 * h], [pad, H - pad]])
    return cv2.warpPerspective(big, cv2.getPerspectiveTransform(src, dst), (W, H), borderValue=(70, 60, 50))
def shadow(im, s):
    h, w = im.shape[:2]; x = np.linspace(1, s, w)[None, :, None]; y = np.linspace(1, .85, h)[:, None, None]
    return np.clip(im * x * y, 0, 255).astype(np.uint8)
def noise(im, s): return np.clip(im + rng.normal(0, s, im.shape), 0, 255).astype(np.uint8)
def phone(im):   # a realistic combination: slight tilt, soft focus, shadow, noise, jpeg
    return jpeg(noise(shadow(gblur(rotate(im, 2.5), 1.3), .55), 6), 55)

CASES = {
    "clean": lambda im: im, "blur1.5": lambda im: gblur(im, 1.5), "blur2.5": lambda im: gblur(im, 2.5), "blur3.5": lambda im: gblur(im, 3.5),
    "motion9": lambda im: motion(im, 9), "motion15": lambda im: motion(im, 15),
    "lowres0.5": lambda im: lowres(im, .5), "lowres0.35": lambda im: lowres(im, .35),
    "jpeg15": lambda im: jpeg(im, 15), "dark0.35": lambda im: dark(im, .35),
    "tilt4": lambda im: rotate(im, 4), "tilt8": lambda im: rotate(im, 8), "persp": lambda im: persp(im, .08),
    "shadow": lambda im: shadow(im, .3), "noise25": lambda im: noise(im, 25), "phone": phone,
}
if __name__ == "__main__":
    out = D / "imgs"; out.mkdir(exist_ok=True)
    for m in (1, 3, 5):
        src = next(SRC.glob(f"month{m}_*.png")); im = cv2.imread(str(src))
        for name, f in CASES.items():
            cv2.imwrite(str(out / f"m{m}_{name}.jpg"), f(im), [cv2.IMWRITE_JPEG_QUALITY, 95])
    print("made", len(list(out.glob("*.jpg"))))
