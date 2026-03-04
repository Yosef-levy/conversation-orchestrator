import asyncio
from dataclasses import dataclass

from .transcript import WRAPPER_USER_END, WRAPPER_USER_START


def _last_user_message(transcript: str) -> str:
    """
    Extract the content of the last <<<USER>>> block in the transcript.
    """
    start_marker = WRAPPER_USER_START
    end_marker = WRAPPER_USER_END
    idx = transcript.rfind(start_marker)
    if idx == -1:
        return "(no user message found)"
    start = idx + len(start_marker)
    # Content is after the start marker; strip leading newline
    content_start = start + 1 if start < len(transcript) and transcript[start] == "\n" else start
    end_idx = transcript.find(end_marker, content_start)
    if end_idx == -1:
        return transcript[content_start:].strip()
    return transcript[content_start:end_idx].strip()


@dataclass
class LLMResponse:
    content: str


class LLMClient:
    """
    Phase 1 LLM stub.

    The orchestrator must treat the LLM as stateless:
    every call includes the full transcript text plus the new user message.
    Stub echoes only the last user message.
    """

    def __init__(self, model_name: str = "stub-echo") -> None:
        self.model_name = model_name

    async def complete(self, transcript: str) -> LLMResponse:
        await asyncio.sleep(2)
        last_user = _last_user_message(transcript)
        content = f"[stub {self.model_name} reply]\n\nEchoing last user message:\n\n{last_user}"
        return LLMResponse(content=content)

