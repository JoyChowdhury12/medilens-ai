"""Step 1 of the AI pipeline: clean the photo with OpenCV, then read text with Tesseract OCR.

Everything runs locally; nothing is sent to any external service.
"""
from dataclasses import dataclass

import logging
import os
import re

import cv2
import numpy as np
import pytesseract

# On Windows, set TESSERACT_CMD to the tesseract.exe path if it is not on PATH, e.g.
# C:\\Program Files\\Tesseract-OCR\\tesseract.exe
if os.getenv("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]

BLUR_LIMIT = 40.0  # Laplacian variance below this = probably too blurry to read


@dataclass
class OcrLine:
    text: str
    confidence: float  # 0-1, average Tesseract word confidence


def load_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read the image. Please upload a JPG or PNG file.")
    return img


def quality_check(gray: np.ndarray) -> dict:
    """Simple checks we can show the user before reading: blur and darkness."""
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    problems = []
    if sharpness < BLUR_LIMIT:
        problems.append("The photo looks blurry. Hold the phone steady and retake it.")
    if brightness < 80:
        problems.append("The photo is too dark. Take it in better light.")
    return {"sharpness": round(sharpness, 1), "brightness": round(brightness, 1), "problems": problems}


def deskew(gray: np.ndarray) -> np.ndarray:
    """Straighten a slightly tilted page using the angle of the text pixels."""
    inverted = cv2.bitwise_not(gray)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 100:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    # OpenCV returns angles in different ranges by version; convert to a small correction.
    if angle > 45:
        angle -= 90
    elif angle < -45:
        angle += 90
    if abs(angle) < 0.3 or abs(angle) > 15:
        return gray
    h, w = gray.shape
    matrix = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocess(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    if w < 1600:  # OCR reads small text better after upscaling
        scale = 1600 / w
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    gray = deskew(gray)
    gray = cv2.fastNlMeansDenoising(gray, h=10)  # slower but clearly more accurate (tested)
    return gray


def flatten_light(gray: np.ndarray) -> np.ndarray:
    """Remove shadows and uneven light (phone photos of curved paper): divide the page by its own background."""
    small = cv2.resize(gray, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    bg = cv2.resize(cv2.medianBlur(small, 51), (gray.shape[1], gray.shape[0]))
    return cv2.divide(gray, bg, scale=255)


def pass_specs(img: np.ndarray):
    """Different ways of reading the same photo (page width, layout mode, clean-up). Tesseract's mistakes change
    from one setting to the next, so the extractor VOTES between them. Yields (clean image, tesseract psm), lazily."""
    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray0.shape

    def resized(width):
        return cv2.resize(gray0, (width, int(h * width / w)), interpolation=cv2.INTER_CUBIC if w < width else cv2.INTER_AREA)

    flat2000 = flatten_light(deskew(resized(2000)))
    yield cv2.fastNlMeansDenoising(flat2000, h=10), 6
    yield cv2.fastNlMeansDenoising(flatten_light(deskew(resized(2600))), h=10), 6
    yield cv2.fastNlMeansDenoising(flat2000, h=10), 4
    yield cv2.adaptiveThreshold(flat2000, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 41, 15), 6


def preprocess_variants(img: np.ndarray) -> list:
    return [g for g, _ in pass_specs(img)]


def read_lines(gray: np.ndarray, psm: int = 6) -> list:
    """Run Tesseract and group words into lines with an average confidence."""
    data = pytesseract.image_to_data(gray, lang="eng", config=f"--psm {psm}",
                                     output_type=pytesseract.Output.DICT)
    lines = {}
    for i, word in enumerate(data["text"]):
        word = word.strip()
        conf = float(data["conf"][i])
        if not word or conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append((word, conf))
    result = []
    for key in sorted(lines):
        words = lines[key]
        text = " ".join(w for w, _ in words)
        conf = sum(c for _, c in words) / len(words) / 100
        result.append(OcrLine(text=text, confidence=round(conf, 2)))
    return result


_RAPID = None
STATUS = {"rapid_installed": None, "rapid_error": None, "last_engine": None}   # shown by /health, helps when OCR looks wrong


def rapid_available() -> bool:
    try:
        import rapidocr_onnxruntime  # noqa: F401
        STATUS["rapid_installed"] = True
        return True
    except Exception as e:
        STATUS["rapid_installed"], STATUS["rapid_error"] = False, f"import failed: {e!r}"
        return False


def read_lines_rapid(img: np.ndarray) -> list:
    """Deep-learning OCR (open-source PaddleOCR models in ONNX, runs locally, no internet, no API).
    Much better than Tesseract on phone photos. Text boxes are grouped into table rows by their height on the page."""
    global _RAPID
    from rapidocr_onnxruntime import RapidOCR
    if _RAPID is None:
        _RAPID = RapidOCR()
    h, w = img.shape[:2]
    if w != 2000:
        img = cv2.resize(img, (2000, int(h * 2000 / w)), interpolation=cv2.INTER_CUBIC if w < 2000 else cv2.INTER_AREA)
    result, _ = _RAPID(img)
    items = []
    for box, text, conf in result or []:
        ys, xs = [p[1] for p in box], [p[0] for p in box]
        items.append(((min(ys) + max(ys)) / 2, min(xs), text.replace("μ", "µ"), float(conf), max(ys) - min(ys)))
    items.sort()
    rows = []
    for it in items:
        if rows and abs(rows[-1][0] - it[0]) < 0.6 * it[4]:
            rows[-1][1].append(it)
        else:
            rows.append([it[0], [it]])
    lines = []
    for _, row in rows:
        row.sort(key=lambda a: a[1])
        lines.append(OcrLine(text=" ".join(a[2] for a in row), confidence=round(sum(a[3] for a in row) / len(row), 2)))
    return _join_range_lines(lines)


_NUM = r"\d+(?:[.,]\d+)?"
# A line that only continues the row above: it starts with a unit, a < > sign or a printed range ("0.9 to 1.7").
# A line starting with a lone number + unit is a NEW result and is never glued.
_CONTINUATION = re.compile(
    rf"^\s*(?:[<>≤≥]|{_NUM}\s*(?:-|–|~|to)\s*{_NUM}|(?:mmol|mg|g|ng|pg|u|iu|miu|uiu|µ\w*|x10\S*|10\S*|k|m)\s*/|%|fl\b|pg\b)", re.I)


def _join_range_lines(lines: list) -> list:
    """A table row sometimes comes out as two lines: "TSH 0.68" and "mIU/L 0.40 - 4.00" (range column a little lower).
    A line that starts with a unit, a number or < > and follows a line with a test name is glued to it."""
    out = []
    for line in lines:
        if out and _CONTINUATION.match(line.text) and re.search(r"[A-Za-z]{2}.*\d", out[-1].text) \
                and not re.search(r"\d\s*(?:-|–|to)\s*\d|[<>]", out[-1].text):
            prev = out[-1]
            out[-1] = OcrLine(text=prev.text + " " + line.text, confidence=round((prev.confidence + line.confidence) / 2, 2))
        else:
            out.append(line)
    return out


def ocr_image_bytes(data: bytes):
    """Full step 1: bytes -> (quality report, list of OcrLine) using the main clean-up."""
    img = load_image(data)
    quality = quality_check(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    if rapid_available():
        try:
            return quality, read_lines_rapid(img)
        except Exception:
            pass
    gray, psm = next(pass_specs(img))
    return quality, read_lines(gray, psm)


def ocr_image_passes(data: bytes):
    """Step 1 for the extractor: (quality, generator of line lists). The 2nd pass is only read if the caller asks for it."""
    img = load_image(data)
    quality = quality_check(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    def reads():
        if rapid_available():
            try:
                lines = read_lines_rapid(img)         # best reader first
                STATUS["rapid_error"], STATUS["last_engine"] = None, "rapid"
                yield "rapid", lines
            except Exception as e:                    # fall back to Tesseract, but remember why
                STATUS["rapid_error"], STATUS["last_engine"] = f"run failed: {e!r}", "tesseract"
                logging.getLogger("medilens").exception("RapidOCR failed, using Tesseract")
        for g, psm in pass_specs(img):
            yield "tesseract", read_lines(g, psm)
    return quality, reads()
