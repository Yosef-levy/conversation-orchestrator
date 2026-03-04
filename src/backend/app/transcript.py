from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .models import Conversation, Message, Note

# Single source of truth for transcript header (static part after title). Also served to frontend.
_CONFIG_DIR = Path(__file__).resolve().parent / "config"
_TRANSCRIPT_HEADER_FILE = _CONFIG_DIR / "transcript_header.txt"

_DEFAULT_HEADER_STATIC = """
You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state.

Continue the conversation by responding as the LLM.
Output only your next single reply (plain text). Do not reproduce wrapper tags.
Do not output further USER, NOTE, or LLM turns—only one assistant reply.

""".strip()


def get_transcript_header_static() -> str:
    """Return the static part of the transcript header (instructions only). Used by BE and served to FE."""
    if _TRANSCRIPT_HEADER_FILE.is_file():
        return _TRANSCRIPT_HEADER_FILE.read_text(encoding="utf-8").strip()
    return _DEFAULT_HEADER_STATIC


WRAPPER_USER_START = "<<<USER>>>"
WRAPPER_USER_END = "<<<END USER>>>"
WRAPPER_LLM_START = "<<<LLM>>>"
WRAPPER_LLM_END = "<<<END LLM>>>"
WRAPPER_NOTE_START = "<<<NOTE>>>"
WRAPPER_NOTE_END = "<<<END NOTE>>>"


def _escape_wrappers(text: str) -> str:
    """
    Escape wrapper tags inside message or note content.

    Simple implementation for Phase 1: replace the opening sequence
    with a visually similar but different token.
    """
    return (
        text.replace("<<<USER>>>", "<< <USER>>")
        .replace("<<<END USER>>>", "<< <END USER>>")
        .replace("<<<LLM>>>", "<< <LLM>>")
        .replace("<<<END LLM>>>", "<< <END LLM>>")
        .replace("<<<NOTE>>>", "<< <NOTE>>")
        .replace("<<<END NOTE>>>", "<< <END NOTE>>")
    )


def build_transcript_header(conversation: Conversation) -> str:
    title = conversation.title or "Conversation"
    static = get_transcript_header_static()
    return f"{title}\n\n{static}"


def serialize_message_block(message: Message, notes: Iterable[Note]) -> str:
    if message.role == "user":
        start, end = WRAPPER_USER_START, WRAPPER_USER_END
    else:
        start, end = WRAPPER_LLM_START, WRAPPER_LLM_END

    parts: list[str] = [
        start,
        _escape_wrappers(message.content),
        end,
        "",
    ]

    sorted_notes = sorted(notes, key=lambda n: (n.created_at, str(n.id)))
    for note in sorted_notes:
        parts.extend(
            [
                WRAPPER_NOTE_START,
                _escape_wrappers(note.content),
                WRAPPER_NOTE_END,
                "",
            ]
        )

    return "\n".join(parts).rstrip()  # avoid trailing spaces


def build_transcript_for_path(
    conversation: Conversation, path_messages: list[Message], notes_by_message: dict
) -> str:
    """
    Build canonical transcript for root→active path.

    - Messages serialized in order
    - Notes inserted immediately after their host message
    - Exactly one blank line between blocks (handled by join logic)
    """
    header = build_transcript_header(conversation)
    blocks: list[str] = [header]

    for msg in path_messages:
        msg_notes = notes_by_message.get(msg.id, [])
        blocks.append(serialize_message_block(msg, msg_notes))

    return "\n\n".join(blocks).strip() + "\n"

