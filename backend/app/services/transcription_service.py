"""
WhisperX-based audio transcription service with speaker diarization.

Models are lazy-loaded as singletons on first use to avoid startup overhead.
The sync transcription runs in a thread executor to avoid blocking the event loop.
"""
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level singletons — loaded once, reused on every request
_whisper_model = None
_align_models: dict = {}  # keyed by language code
_diarize_pipeline = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        import torch
        import whisperx

        from app.config import settings

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        logger.info(
            "Loading WhisperX model '%s' on %s (compute_type=%s)...",
            settings.WHISPER_MODEL_SIZE,
            device,
            compute_type,
        )
        _whisper_model = whisperx.load_model(
            settings.WHISPER_MODEL_SIZE,
            device,
            compute_type=compute_type,
        )
        logger.info("WhisperX model loaded.")
    return _whisper_model


def _get_diarize_pipeline():
    global _diarize_pipeline
    if _diarize_pipeline is None:
        import torch
        from pyannote.audio import Pipeline

        from app.config import settings

        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading pyannote speaker diarization pipeline...")
        _diarize_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.HF_TOKEN or None,
        )
        if device == "cuda":
            _diarize_pipeline = _diarize_pipeline.to(torch.device("cuda"))
        logger.info("Diarization pipeline loaded.")
    return _diarize_pipeline


def _sync_transcribe(audio_path: str) -> str:
    """
    Synchronous transcription + diarization.
    Must be called via run_in_executor — NOT directly from async code.

    Returns a formatted transcript string like:
        [SPEAKER_00] Tell me about yourself.
        [SPEAKER_01] Sure, I have 5 years of experience in Python...
    """
    import torch
    import whisperx

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _get_whisper_model()

    audio = whisperx.load_audio(audio_path)

    # Step 1: Transcribe
    result = model.transcribe(audio, batch_size=8)
    language: str = result.get("language", "en")
    logger.info("Transcription done. Detected language: %s", language)

    # Step 2: Align (word-level timestamps for better diarization)
    try:
        if language not in _align_models:
            model_a, metadata = whisperx.load_align_model(
                language_code=language, device=device
            )
            _align_models[language] = (model_a, metadata)
        model_a, metadata = _align_models[language]
        result = whisperx.align(
            result["segments"],
            model_a,
            metadata,
            audio,
            device,
            return_char_alignments=False,
        )
        logger.info("Alignment done.")
    except Exception as exc:
        logger.warning("Alignment failed (%s). Proceeding without alignment.", exc)

    # Step 3: Diarize (assign SPEAKER_xx labels)
    try:
        diarize_pipeline = _get_diarize_pipeline()
        diarize_segments = diarize_pipeline(audio_path)
        result = whisperx.assign_word_speakers(diarize_segments, result)
        logger.info("Diarization done.")
    except Exception as exc:
        logger.warning("Diarization failed (%s). Proceeding without speaker labels.", exc)

    # Step 4: Format labeled transcript
    lines = []
    for segment in result.get("segments", []):
        speaker = segment.get("speaker", "SPEAKER_00")
        text = segment.get("text", "").strip()
        if text:
            lines.append(f"[{speaker}] {text}")

    return "\n".join(lines)


async def transcribe_audio_background(eval_id: str, audio_path: str) -> None:
    """
    Background async task: run WhisperX transcription in a thread executor,
    then update the InterviewEvaluation record with the result.
    """
    from sqlalchemy import select

    from app.database import async_session
    from app.models.interview import InterviewEvaluation

    try:
        loop = asyncio.get_running_loop()
        transcript: str = await loop.run_in_executor(
            None, _sync_transcribe, audio_path
        )

        async with async_session() as db:
            res = await db.execute(
                select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
            )
            evaluation = res.scalar_one_or_none()
            if evaluation:
                evaluation.transcript = transcript
                evaluation.transcript_status = "completed"
                await db.commit()
                logger.info("Transcription completed for eval %s.", eval_id)

    except Exception as exc:
        logger.error("Transcription failed for eval %s: %s", eval_id, exc)
        try:
            async with async_session() as db:
                res = await db.execute(
                    select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
                )
                evaluation = res.scalar_one_or_none()
                if evaluation:
                    evaluation.transcript_status = "failed"
                    await db.commit()
        except Exception:
            pass
