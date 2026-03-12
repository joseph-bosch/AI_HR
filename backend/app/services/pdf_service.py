import os
import uuid
from pathlib import Path

from app.config import settings


async def generate_offer_pdf(offer) -> str:
    """Generate a PDF from offer letter content using weasyprint."""
    from weasyprint import HTML

    output_dir = Path(settings.GENERATED_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"offer_{offer.id}_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = str(output_dir / filename)

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Segoe UI', 'Microsoft YaHei', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                max-width: 800px;
                margin: 40px auto;
                padding: 40px;
                color: #333;
            }}
            h1 {{ color: #1a1a2e; font-size: 24px; }}
            h2 {{ color: #16213e; font-size: 18px; }}
            p {{ margin: 10px 0; }}
        </style>
    </head>
    <body>
        {_text_to_html(offer.content)}
    </body>
    </html>
    """

    HTML(string=html_content).write_pdf(pdf_path)
    return pdf_path


_PDF_LABELS = {
    "en": {
        "interview_round": "Interview Round",
        "total_questions": "Total Questions",
        "scoring_rubric": "Scoring Rubric",
        "interviewer_guidance": "Interviewer Guidance",
        "good_answer_indicators": "Good Answer Indicators",
        "red_flags": "Red Flags",
    },
    "zh": {
        "interview_round": "面试轮次",
        "total_questions": "题目总数",
        "scoring_rubric": "评分标准",
        "interviewer_guidance": "面试官指引",
        "good_answer_indicators": "优秀回答指标",
        "red_flags": "危险信号",
    },
}


def _get_translated_field(item, field: str, lang: str | None, primary_lang: str) -> str | None:
    """Return the translated field value if available, otherwise fall back to primary."""
    if lang and lang != primary_lang and item.translations:
        translated = item.translations.get(lang, {})
        if translated and field in translated:
            return translated[field]
    return getattr(item, field, None)


async def generate_question_set_pdf(question_set, items, lang: str | None = None) -> str:
    """Generate a PDF from a question set in the requested language."""
    from weasyprint import HTML

    output_dir = Path(settings.GENERATED_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"questions_{question_set.id}_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = str(output_dir / filename)

    primary_lang = getattr(question_set, 'primary_language', 'en') or 'en'
    labels = _PDF_LABELS.get(lang or primary_lang, _PDF_LABELS["en"])

    questions_html = ""
    for i, item in enumerate(items, 1):
        question_text = _get_translated_field(item, 'question_text', lang, primary_lang) or item.question_text
        guidance = _get_translated_field(item, 'interviewer_guidance', lang, primary_lang)
        good_indicators = _get_translated_field(item, 'good_answer_indicators', lang, primary_lang)
        red_flags = _get_translated_field(item, 'red_flags', lang, primary_lang)

        rubric = None
        if lang and lang != primary_lang and item.translations:
            translated = item.translations.get(lang, {})
            if translated and 'scoring_rubric' in translated:
                rubric = translated['scoring_rubric']
        if not rubric:
            rubric = item.scoring_rubric

        rubric_html = ""
        if rubric:
            rubric_rows = ""
            for score, desc in rubric.items():
                rubric_rows += f"<tr><td><strong>{score}</strong></td><td>{desc}</td></tr>"
            rubric_html = f"""
            <div class="rubric">
                <strong>{labels['scoring_rubric']}:</strong>
                <table>{rubric_rows}</table>
            </div>
            """

        questions_html += f"""
        <div class="question">
            <h3>Q{i}. [{item.category.replace('_', ' ').title()}] {question_text}</h3>
            {f'<p><strong>{labels["interviewer_guidance"]}:</strong> {guidance}</p>' if guidance else ''}
            {f'<p class="good"><strong>{labels["good_answer_indicators"]}:</strong> {good_indicators}</p>' if good_indicators else ''}
            {f'<p class="red"><strong>{labels["red_flags"]}:</strong> {red_flags}</p>' if red_flags else ''}
            {rubric_html}
        </div>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Segoe UI', 'Microsoft YaHei', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.5;
                max-width: 800px;
                margin: 20px auto;
                padding: 30px;
                color: #333;
            }}
            h1 {{ color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }}
            h2 {{ color: #16213e; }}
            h3 {{ color: #0f3460; margin-top: 20px; }}
            .question {{
                border: 1px solid #e0e0e0;
                padding: 15px;
                margin: 15px 0;
                border-radius: 5px;
                page-break-inside: avoid;
            }}
            .good {{ color: #2d6a4f; }}
            .red {{ color: #d32f2f; }}
            .rubric table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
                font-size: 0.9em;
            }}
            .rubric td {{
                border: 1px solid #ddd;
                padding: 5px 10px;
            }}
            .meta {{ color: #666; font-size: 0.9em; }}
        </style>
    </head>
    <body>
        <h1>{question_set.name}</h1>
        <p class="meta">{labels['interview_round']}: {question_set.interview_round.replace('_', ' ').title()}</p>
        <p class="meta">{labels['total_questions']}: {len(items)}</p>
        <hr>
        {questions_html}
    </body>
    </html>
    """

    HTML(string=html_content).write_pdf(pdf_path)
    return pdf_path


def _text_to_html(text: str) -> str:
    """Convert plain text to basic HTML paragraphs."""
    paragraphs = text.split("\n\n")
    html_parts = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        lines = p.split("\n")
        html_parts.append("<p>" + "<br>".join(lines) + "</p>")
    return "\n".join(html_parts)
