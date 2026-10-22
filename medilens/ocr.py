"""Step 1 of the AI pipeline: clean the photo with OpenCV, then read text with Tesseract OCR.

Everything runs locally; nothing is sent to any external service.
"""
from dataclasses import dataclass

import os

import cv2
import numpy as np
import pytesseract

# On Windows, set TESSERACT_CMD to the tesseract.exe path if it is not on PATH, e.g.
# C:\\Program Files\\Tesseract-OCR\\tesseract.exe
if os.getenv("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]

BLUR_LIMIT = 60.0  # Laplacian variance below this = probably too blurry to read


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


def read_lines(gray: np.ndarray) -> list:
    """Run Tesseract and group words into lines with an average confidence."""
    data = pytesseract.image_to_data(gray, lang="eng", config="--psm 6",
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


def ocr_image_bytes(data: bytes):
    """Full step 1: bytes -> (quality report, list of OcrLine)."""
    img = load_image(data)
    gray_raw = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    quality = quality_check(gray_raw)
    lines = read_lines(preprocess(img))
    return quality, lines
