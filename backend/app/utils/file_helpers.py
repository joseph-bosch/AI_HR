from pathlib import Path


ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def is_allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def get_mime_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return MIME_TYPES.get(ext, "application/octet-stream")
