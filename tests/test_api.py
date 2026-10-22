"""API tests: start the app in memory and call each endpoint."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_extract_text_then_interpret():
    found = client.post("/extract-text", json={"text": "FBS 7.4 H mmol/L 3.9 - 6.1\nTSH 2.1 mIU/L 0.4-4.0"}).json()
    assert len(found["tests"]) == 2
    out = client.post("/interpret", json={"sex": "female", "tests": found["tests"]}).json()
    assert out["results"][0]["status"] == "high"
    assert out["summary_bn"]


def test_extract_rejects_wrong_file_type():
    r = client.post("/extract", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_extract_sample_image():
    sample = ROOT / "samples" / "sample_report.jpg"
    r = client.post("/extract", files={"file": ("r.jpg", sample.read_bytes(), "image/jpeg")})
    assert r.status_code == 200
    codes = {t["code"] for t in r.json()["tests"]}
    assert len(codes) >= 5
