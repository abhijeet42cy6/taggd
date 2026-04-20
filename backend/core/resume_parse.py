"""Heuristic resume/CV text extraction and field extraction for autofill.

Uses pypdf (PDF) and python-docx (DOCX). Parsing quality varies by resume layout;
results are best-effort and should be reviewed by the user.
"""

from __future__ import annotations

import io
import os
import re
from typing import Any, Optional


def extract_resume_text(filename: str, data: bytes) -> str:
    ext = os.path.splitext(filename or "")[1].lower() or ".pdf"
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
        return "\n".join(parts) if parts else ""
    if ext == ".docx":
        import docx

        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if ext == ".doc":
        raise ValueError("Legacy .doc is not supported. Please upload PDF or .docx.")
    raise ValueError(f"Unsupported file type {ext!r}")


def _norm(s: str) -> str:
    return re.sub(r"[ \t]+", " ", s.replace("\r", "\n")).strip()


def _lines(text: str) -> list[str]:
    return [_norm(x) for x in text.split("\n") if _norm(x)]


_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:\+91[\s\-]?)?[6-9]\d{9}\b|\b\d{10}\b")
_YEARS_EXP_RE = re.compile(
    r"(?P<n>\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?\.?|y\.?o\.?e\.?)\b", re.I
)
_LPA_RE = re.compile(
    r"(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakhs?|L\.?\s*P\.?A\.?)\b",
    re.I,
)
_NOTICE_RE = re.compile(r"(?P<n>\d+)\s*(?:days?|d\.?)\s*(?:notice|np\b)", re.I)


def _first_email(text: str) -> Optional[str]:
    m = _EMAIL_RE.search(text)
    return m.group(0) if m else None


def _phones(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for m in _PHONE_RE.finditer(text):
        raw = re.sub(r"\s+", "", m.group(0))
        if len(raw) >= 10 and raw not in seen:
            seen.add(raw)
            out.append(m.group(0).strip())
    return out[:3]


def _guess_name(lines: list[str], email: Optional[str]) -> Optional[str]:
    skip = re.compile(
        r"^(resume|cv|curriculum|vitae|phone|email|mobile|linkedin|github|http|www\.|\d)",
        re.I,
    )
    for ln in lines[:25]:
        if len(ln) < 2 or len(ln) > 80:
            continue
        if _EMAIL_RE.search(ln) or "http" in ln.lower():
            continue
        if skip.search(ln):
            continue
        if re.match(r"^[\d\s\-+()]+$", ln):
            continue
        if sum(c.isalpha() for c in ln) < len(ln.replace(" ", "")) * 0.4:
            continue
        # Prefer title-ish line (2–5 words)
        words = ln.split()
        if 2 <= len(words) <= 6:
            return ln.strip()
    return None


def _section_bounds(lines: list[str], headers: tuple[str, ...]) -> tuple[int, int]:
    start = 0
    found = False
    for i, ln in enumerate(lines):
        u = re.sub(r"^[:\s|\-–—]+", "", ln).upper().strip()
        for h in headers:
            hu = h.upper()
            if u == hu or u.startswith(hu + " ") or u.startswith(hu + ":"):
                start = i + 1
                found = True
                break
        if found:
            break
    if not found:
        return 0, 0
    end = len(lines)
    stop_headers = (
        "EDUCATION",
        "ACADEMIC",
        "QUALIFICATION",
        "SKILLS",
        "TECHNICAL SKILLS",
        "PROJECTS",
        "CERTIFICATIONS",
        "AWARDS",
        "PERSONAL DETAILS",
        "DECLARATION",
    )
    for j in range(start, len(lines)):
        u = re.sub(r"^[:\s|\-–—]+", "", lines[j]).upper().strip()
        if u in stop_headers or any(u.startswith(x + ":") or u == x for x in stop_headers):
            end = j
            break
    return start, end


def _parse_experience_block(lines: list[str]) -> list[dict[str, Any]]:
    """Extract simple role entries from an experience section."""
    if not lines:
        return []
    roles: list[dict[str, Any]] = []
    buf: list[str] = []
    date_pat = re.compile(
        r"(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}\s*[-–—]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}|"
        r"\d{4}\s*[-–—]\s*(?:Present|Current|Till date|date)",
        re.I,
    )

    def flush_block() -> None:
        nonlocal buf
        if not buf:
            return
        chunk = " ".join(buf)
        dm = date_pat.search(chunk)
        start_date = ""
        end_date = ""
        if dm:
            start_date = dm.group(0).split("–")[0].split("-")[0].strip()[:32]
            rest = chunk[dm.end() :].strip()
        else:
            rest = chunk
        parts = [p.strip() for p in re.split(r"\s*[|•]\s*", rest) if p.strip()]
        title = parts[0][:200] if parts else ""
        company = parts[1][:200] if len(parts) > 1 else ""
        if title or company:
            roles.append(
                {
                    "title": title or None,
                    "company": company or None,
                    "start_date": start_date or None,
                    "end_date": end_date or None,
                    "description": chunk[:2000] if len(chunk) > 120 else None,
                }
            )
        buf = []

    for ln in lines:
        if date_pat.search(ln) and buf:
            flush_block()
        buf.append(ln)
    flush_block()

    # Fallback: paragraph chunks
    if not roles and lines:
        para = " ".join(lines[:40])
        chunks = re.split(r"\n{2,}", para)
        for ch in chunks[:8]:
            ch = ch.strip()
            if len(ch) < 20:
                continue
            roles.append(
                {
                    "title": ch.split("\n")[0][:200],
                    "company": None,
                    "start_date": None,
                    "end_date": None,
                    "description": ch[:2000],
                }
            )
            if len(roles) >= 6:
                break
    return roles


def _education_line(lines: list[str]) -> tuple[Optional[str], Optional[str]]:
    s, e = _section_bounds(lines, ("EDUCATION", "ACADEMIC QUALIFICATION", "QUALIFICATION"))
    chunk = " ".join(lines[s:e][:12]) if s < e else ""
    if not chunk:
        return None, None
    deg = re.search(
        r"\b(B\.?Tech|M\.?Tech|B\.?E\.?|M\.?E\.?|B\.?Sc|M\.?Sc|MBA|MCA|B\.?Com|M\.?Com|Ph\.?D|Diploma)\b[^.\n]{0,80}",
        chunk,
        re.I,
    )
    qual = deg.group(0).strip() if deg else None
    spec_m = re.search(r"(?:in|specialization|specialized in)\s+([A-Za-z][A-Za-z\s,&\-]{2,60})", chunk, re.I)
    spec = spec_m.group(1).strip() if spec_m else None
    return qual, spec


def _total_years(text: str) -> Optional[float]:
    best: Optional[float] = None
    for m in _YEARS_EXP_RE.finditer(text):
        try:
            v = float(m.group("n"))
            if best is None or v > best:
                best = v
        except ValueError:
            continue
    return best


def _lpa_values(text: str) -> list[float]:
    out: list[float] = []
    for m in _LPA_RE.finditer(text):
        try:
            out.append(float(m.group(1)))
        except ValueError:
            pass
    return out


def _notice_days(text: str) -> Optional[int]:
    m = _NOTICE_RE.search(text)
    if m:
        try:
            return int(m.group("n"))
        except ValueError:
            pass
    m2 = re.search(r"(?:notice|np)[:\s]+(\d+)\s*(?:days?|d\b)", text, re.I)
    if m2:
        try:
            return int(m2.group(1))
        except ValueError:
            pass
    return None


def _summary_text(text: str, lines: list[str]) -> Optional[str]:
    s, e = _section_bounds(
        lines,
        (
            "SUMMARY",
            "PROFESSIONAL SUMMARY",
            "PROFILE",
            "CAREER OBJECTIVE",
            "OBJECTIVE",
        ),
    )
    if s < e:
        body = "\n".join(lines[s:e])
        body = body.strip()
        if len(body) > 40:
            return body[:8000]
    # first paragraph of substance
    for ln in lines[:30]:
        if len(ln) > 80 and not _EMAIL_RE.search(ln):
            return ln[:8000]
    return text[:1200].strip() if text else None


def parse_resume_text(raw: str) -> dict[str, Any]:
    text = _norm(raw)
    if not text:
        return {}
    lines = _lines(raw)
    email = _first_email(text)
    phones = _phones(text)
    contact = phones[0] if phones else None
    alt = phones[1] if len(phones) > 1 else None
    name = _guess_name(lines, email)

    loc_m = re.search(
        r"(?:Location|Address|Based in|Residing in)[:\s]+([^\n]+)", text, re.I
    )
    location = loc_m.group(1).strip()[:200] if loc_m else None

    gen_m = re.search(r"Gender[:\s]+(Male|Female|Other)\b", text, re.I)
    gender = gen_m.group(1) if gen_m else None

    qual, spec = _education_line(lines)
    total_y = _total_years(text)
    lpas = _lpa_values(text)
    current_ctc = lpas[0] if lpas else None
    expected_ctc = lpas[1] if len(lpas) > 1 else None

    exp_s, exp_e = _section_bounds(
        lines,
        (
            "EXPERIENCE",
            "WORK EXPERIENCE",
            "EMPLOYMENT",
            "WORK HISTORY",
            "PROFESSIONAL EXPERIENCE",
        ),
    )
    exp_lines = lines[exp_s:exp_e] if exp_s < exp_e else []
    roles = _parse_experience_block(exp_lines)

    designation = None
    organization = None
    if roles and roles[0].get("title"):
        designation = roles[0].get("title")
        organization = roles[0].get("company")

    summary = _summary_text(text, lines)

    notice = _notice_days(text)

    out: dict[str, Any] = {}
    if name:
        out["full_name"] = name
    if email:
        out["email_id"] = email
    if contact:
        out["contact_no"] = contact
    if alt:
        out["alternate_contact_no"] = alt
    if location:
        out["current_location"] = location
    if gender:
        out["gender"] = gender
    if qual:
        out["qualification"] = qual[:512]
    if spec:
        out["specialization"] = spec[:512]
    if total_y is not None:
        out["total_experience_yrs"] = total_y
    if organization:
        out["current_organization"] = organization[:512]
    if designation:
        out["current_designation"] = designation[:512]
    if notice is not None:
        out["notice_period_days"] = notice
    if current_ctc is not None:
        out["current_ctc_lpa"] = current_ctc
    if expected_ctc is not None:
        out["expected_ctc_lpa"] = expected_ctc
    if summary:
        out["professional_summary"] = summary
    if roles:
        out["professional_experience_json"] = roles

    return out
