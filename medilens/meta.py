"""Report date and lab name, read from the OCR text of the report header.

Both are only SUGGESTIONS that fill the form; the user can change them before confirming.
Dates are day/month/year (the way Bangladeshi labs print them).
"""
import re
from datetime import date
from typing import Optional

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Which date on the report is "the report date"? Best first: when the blood was taken, then the report/bill dates.
DATE_LABELS = [r"collect\w*", r"sampl\w*", r"report\s*date|date\s*of\s*report|reported", r"bill\w*", r"date", r"print\w*",
               r"receiv\w*", r"deliv\w*"]
NUMERIC = r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})\b"
WORDY = r"(\d{1,2})\s*(?:st|nd|rd|th)?[\s\-]*([A-Za-z]{3})[a-z]*[\s\-,.]*(\d{4}|\d{2})\b"


def _make(d: int, m: int, y: int) -> Optional[str]:
    y = y + 2000 if y < 100 else y
    try:
        found = date(y, m, d)
    except ValueError:
        return None
    if found > date.today() or found.year < 2000:
        return None
    return found.isoformat()


def _dates_in(text: str):
    """All plausible dates in the text with their position: [(start, 'YYYY-MM-DD')]."""
    out = []
    for m in re.finditer(NUMERIC, text):
        iso = _make(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if iso:
            out.append((m.start(), iso))
    for m in re.finditer(WORDY, text):
        mon = MONTHS.get(m.group(2).lower())
        if mon:
            iso = _make(int(m.group(1)), mon, int(m.group(3)))
            if iso:
                out.append((m.start(), iso))
    return sorted(out)


def find_report_date(text: str) -> Optional[str]:
    head = "\n".join(text.splitlines()[:40])          # the header, not the footer ("Printed on ...")
    for label in DATE_LABELS:
        for m in re.finditer(label, head, re.I):
            window = head[m.end(): m.end() + 40]      # the date comes right after its label
            found = _dates_in(window)
            if found:
                return found[0][1]
    found = _dates_in(head)
    return found[0][1] if found else None


LAB_WORDS = re.compile(r"diagnostic|hospital|laborator|clinic|pathology|medical|health\s*care|healthcare|medi\w*\s*centre|centre|center", re.I)
NOT_LAB = re.compile(r"\b(?:road|tel|phone|mobile|e-?mail|web|house|fax|hotline|estimations|carried out|analy[sz]er|specimen|"
                     r"referred|ref\.?\s*by|patient|report|checked|printed|signature|prof|dr\.?)\b|@|www|\d{5,}", re.I)


def find_lab_name(text: str) -> Optional[str]:
    for line in text.splitlines()[:14]:
        line = re.sub(r"\s+", " ", line).strip(" -:|*•·")
        if 8 <= len(line) <= 80 and LAB_WORDS.search(line) and not NOT_LAB.search(line):
            line = re.sub(r"^[^A-Za-z]+", "", line)
            # a slogan in the same row ("Pioneer in Health Care IBN SINA DIAGNOSTIC ...") is dropped
            rest = re.sub(r"(?i)^.*?health\s*care\s+", "", line)
            if rest != line and re.search(r"(?i)diagnostic|hospital|laborator|clinic|centre|center", rest):
                line = rest
            # OCR often glues capital letters together ("DIAGNOSTIC&CONSULTATI"): put spaces back around known words
            line = re.sub(r"(?i)(diagnostic|consultati\w*|centre|center|hospital|laborator\w*|clinic|pathology|ltd)", r" \1 ", line)
            line = re.sub(r"\s*&\s*", " & ", line)
            line = re.sub(r"\s+([.,])", r"\1", re.sub(r"\s+", " ", line)).strip()
            line = re.sub(r"(?i)\b(\w+(?: \w+){0,2}) \1\b", r"\1", line)     # "Ibn Sina Ibn Sina ..." -> "Ibn Sina ..."
            if line.isupper() or line.islower() or " " not in line[:6]:
                line = line.title()
            return line[:120]
    return None


def find_meta(text: str) -> dict:
    return {"report_date": find_report_date(text), "lab_name": find_lab_name(text)}
