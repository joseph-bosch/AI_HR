from pathlib import Path


def extract_text_from_pdf(file_path: str) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(file_path)
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts).strip()


def extract_text_from_docx(file_path: str) -> str:
    """Extract all text from a .docx file regardless of layout.

    Parses the raw XML so that text inside paragraphs, tables, text boxes,
    shapes, headers, and footers is captured — not just ``doc.paragraphs``.
    """
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    parts: list[str] = []
    with zipfile.ZipFile(file_path) as z:
        # document.xml is the main body; also check headers/footers
        xml_files = [
            n for n in z.namelist()
            if n.startswith("word/") and n.endswith(".xml")
            and any(k in n for k in ("document", "header", "footer"))
        ]
        for xml_file in xml_files:
            with z.open(xml_file) as f:
                tree = ET.parse(f)
            for p in tree.getroot().findall(".//w:p", ns):
                runs = p.findall(".//w:t", ns)
                line = "".join(t.text for t in runs if t.text)
                if line.strip():
                    parts.append(line)

    return "\n".join(parts).strip()


def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip()


def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
