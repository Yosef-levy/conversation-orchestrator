import asyncio
from dataclasses import dataclass
from typing import Optional

import httpx

from .config import get_settings
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


class _StubClient:
    """Echo stub for tests and when no LLM server is available."""

    def __init__(self, model_name: str = "stub-echo") -> None:
        self.model_name = model_name

    async def complete(self, transcript: str) -> LLMResponse:
        await asyncio.sleep(2)
        last_user = _last_user_message(transcript)
        content = f"[stub {self.model_name} reply]\n\nEchoing last user message:\n\n{last_user}"
        return LLMResponse(content=content)


def _trim_single_llm_reply(raw: str) -> str:
    """
    Keep only the first LLM reply. The model may continue the transcript format
    (<<<LLM>>>, <<<USER>>>, etc.); we stop at end-of-reply markers and strip tags.
    Also strip the escaped form << <LLM>> and any duplicate content after it.
    """
    if not raw:
        return ""
    # Stop at next turn or end-of-LLM so we don't keep multiple turns
    for stop in ("<<<END LLM>>>", "\n<<<USER>>>", "\n\n<<<USER>>>", "<<<USER>>>"):
        if stop in raw:
            raw = raw.split(stop)[0]
    raw = raw.strip()
    # If model output the <<<LLM>>> tag, drop it and take the rest
    if raw.startswith("<<<LLM>>>"):
        raw = raw[len("<<<LLM>>>") :].strip()
    if raw.endswith("<<<END LLM>>>"):
        raw = raw[: -len("<<<END LLM>>>")].strip()
    # Escaped tag << <LLM>> in prompt can be echoed by model; take only content before it
    if "<< <LLM>>" in raw:
        raw = raw.split("<< <LLM>>")[0].strip()
    return raw


class _VLLMClient:
    """vLLM OpenAI-compatible API (/v1/completions)."""

    def __init__(
        self,
        base_url: str,
        model: str,
        max_tokens: int = 2048,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._max_tokens = max_tokens
        self._stop = ["<<<END LLM>>>", "\n<<<USER>>>", "\n\n<<<USER>>>"]

    async def complete(self, transcript: str) -> LLMResponse:
        url = f"{self._base}/v1/completions"
        payload = {
            "model": self._model,
            "prompt": transcript,
            "max_tokens": self._max_tokens,
            "temperature": 0.7,
            "stop": self._stop,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return LLMResponse(content="")
        text = choices[0].get("text") or ""
        content = _trim_single_llm_reply(text)
        return LLMResponse(content=content)


class LLMClient:
    """
    LLM client: delegates to stub (default) or vLLM based on config.
    Set LLM_PROVIDER=vllm and optionally LLM_VLLM_BASE_URL, LLM_VLLM_MODEL to use vLLM.
    """

    def __init__(self, settings: Optional[object] = None) -> None:
        settings = settings or get_settings()
        provider = (getattr(settings, "llm_provider", None) or "stub").strip().lower()
        if provider == "vllm":
            self._impl = _VLLMClient(
                base_url=getattr(settings, "llm_vllm_base_url", "http://localhost:8000"),
                model=getattr(settings, "llm_vllm_model", "Qwen/Qwen2.5-14B-Instruct-AWQ"),
                max_tokens=getattr(settings, "llm_max_tokens", 2048),
            )
        else:
            self._impl = _StubClient(model_name=getattr(settings, "llm_model_name", "stub-echo"))

    async def complete(self, transcript: str) -> LLMResponse:
        return await self._impl.complete(transcript)

