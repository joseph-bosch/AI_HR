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
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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


async def generate_question_set_pdf(question_set, items) -> str:
    """Generate a PDF from a question set."""
    from weasyprint import HTML

    output_dir = Path(settings.GENERATED_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"questions_{question_set.id}_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = str(output_dir / filename)

    questions_html = ""
    for i, item in enumerate(items, 1):
        rubric_html = ""
        if item.scoring_rubric:
            rubric_rows = ""
            for score, desc in item.scoring_rubric.items():
                rubric_rows += f"<tr><td><strong>{score}</strong></td><td>{desc}</td></tr>"
            rubric_html = f"""
            <div class="rubric">
                <strong>Scoring Rubric:</strong>
                <table>{rubric_rows}</table>
            </div>
            """

        questions_html += f"""
        <div class="question">
            <h3>Q{i}. [{item.category.replace('_', ' ').title()}] {item.question_text}</h3>
            {f'<p><strong>Interviewer Guidance:</strong> {item.interviewer_guidance}</p>' if item.interviewer_guidance else ''}
            {f'<p class="good"><strong>Good Answer Indicators:</strong> {item.good_answer_indicators}</p>' if item.good_answer_indicators else ''}
            {f'<p class="red"><strong>Red Flags:</strong> {item.red_flags}</p>' if item.red_flags else ''}
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
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
        <p class="meta">Interview Round: {question_set.interview_round.replace('_', ' ').title()}</p>
        <p class="meta">Total Questions: {len(items)}</p>
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
