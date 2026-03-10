"""Parse .eml and .msg email files into a common dict format."""
import re
from pathlib import Path


def _strip_html(html: str) -> str:
    """Very simple HTML tag stripper."""
    text = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_eml(file_path: str) -> dict:
    """Parse an RFC-2822 .eml file."""
    import email
    from email import policy as email_policy

    with open(file_path, "rb") as f:
        raw = f.read()

    msg = email.message_from_bytes(raw, policy=email_policy.default)

    sender = str(msg.get("From", ""))
    subject = str(msg.get("Subject", ""))

    body_parts: list[str] = []
    attachments: list[tuple[str, bytes]] = []

    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get_content_disposition() or "")

        if "attachment" in disposition:
            filename = part.get_filename()
            payload = part.get_payload(decode=True)
            if filename and payload:
                attachments.append((filename, payload))
        elif content_type == "text/plain" and "attachment" not in disposition:
            try:
                body_parts.append(part.get_content())
            except Exception:
                pass
        elif content_type == "text/html" and "attachment" not in disposition and not body_parts:
            try:
                body_parts.append(_strip_html(part.get_content()))
            except Exception:
                pass

    return {
        "sender": sender,
        "subject": subject,
        "body": "\n".join(body_parts).strip(),
        "attachments": attachments,
    }


def parse_msg(file_path: str) -> dict:
    """Parse a Microsoft Outlook .msg file."""
    try:
        import extract_msg  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "extract-msg is required: pip install extract-msg"
        ) from exc

    with extract_msg.openMsg(file_path) as msg:
        sender = str(msg.sender or "")
        subject = str(msg.subject or "")
        body = str(msg.body or "").strip()

        attachments: list[tuple[str, bytes]] = []
        for att in (msg.attachments or []):
            name = getattr(att, "longFilename", None) or getattr(att, "shortFilename", None)
            data = getattr(att, "data", None)
            if name and data:
                attachments.append((name, data))

    return {
        "sender": sender,
        "subject": subject,
        "body": body,
        "attachments": attachments,
    }


def parse_email_file(file_path: str) -> dict:
    """Dispatch to the correct parser based on file extension."""
    ext = Path(file_path).suffix.lower()
    if ext == ".eml":
        return parse_eml(file_path)
    elif ext == ".msg":
        return parse_msg(file_path)
    else:
        raise ValueError(f"Unsupported email format: {ext}. Use .eml or .msg")
