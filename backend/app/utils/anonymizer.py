import copy
import re


def anonymize_parsed_data(parsed_data: dict) -> dict:
    """Remove PII from parsed resume data for bias-free screening."""
    anon = copy.deepcopy(parsed_data)

    # Remove contact information
    if "contact" in anon:
        anon["contact"] = {
            "name": None,
            "email": None,
            "phone": None,
            "location": anon["contact"].get("location"),  # Keep general location
            "linkedin": None,
        }

    # Remove name references from summary
    if "summary" in anon and anon["summary"] and "contact" in parsed_data:
        name = parsed_data.get("contact", {}).get("name", "")
        if name:
            anon["summary"] = anon["summary"].replace(name, "[CANDIDATE]")

    # Remove age/DOB indicators if present
    if "date_of_birth" in anon:
        del anon["date_of_birth"]
    if "age" in anon:
        del anon["age"]
    if "gender" in anon:
        del anon["gender"]
    if "photo" in anon:
        del anon["photo"]
    if "marital_status" in anon:
        del anon["marital_status"]

    return anon
