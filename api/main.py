"""MediLens AI service (FastAPI). The website's backend calls these endpoints.

Run:   uvicorn api.main:app --reload --port 8000
Docs:  open http://localhost:8000/docs in your browser to try every endpoint.
"""
import sys
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medilens import local_model  # noqa: E402
from medilens.pipeline import extract_from_image, extract_from_pdf, extract_from_text, interpret  # noqa: E402

app = FastAPI(title="MediLens AI Service", version="0.1.0",
              description="Reads English lab reports and explains results in Bangla. No external AI API is used.")

MAX_BYTES = 10 * 1024 * 1024


class TextIn(BaseModel):
    text: str


class ConfirmedTest(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    value: float
    printed_low: Optional[float] = None
    printed_high: Optional[float] = None


class InterpretIn(BaseModel):
    sex: Optional[Literal["male", "female"]] = None
    age: Optional[int] = None
    tests: List[ConfirmedTest]


@app.get("/health")
def health():
    return {"status": "ok", "fine_tuned_model": "on" if local_model.enabled() else "off (using rules and templates)"}


@app.post("/extract")
async def extract_image(file: UploadFile = File(...)):
    """Step 1: upload a JPG/PNG photo or a PDF of the report. Returns the values found, for the user to confirm."""
    if file.content_type not in ("image/jpeg", "image/png", "application/pdf"):
        raise HTTPException(400, "Please upload a JPG, PNG or PDF file.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "File is larger than 10 MB.")
    try:
        if file.content_type == "application/pdf":
            return extract_from_pdf(data)
        return extract_from_image(data)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/extract-text")
def extract_text(body: TextIn):
    """Step 1 (text version): paste report text instead of a photo."""
    return extract_from_text(body.text)


@app.post("/interpret")
def interpret_tests(body: InterpretIn):
    """Step 2: send the CONFIRMED values. Returns status, reasons, Bangla explanations and next step."""
    return interpret([t.model_dump() for t in body.tests], body.sex, body.age)
