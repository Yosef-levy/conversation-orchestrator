from __future__ import annotations

from typing import Iterable

from .models import Conversation, Message, Note


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
    header_lines = [
        title,
        "",
        "You are given a structured conversation transcript.",
        "",
        "The transcript consists of:",
        "- <<<USER>>> blocks (user messages)",
        "- <<<LLM>>> blocks (assistant responses)",
        "- <<<NOTE>>> blocks (user-authored state notes)",
        "",
        "NOTES are contextual clarifications or decisions and must be treated as part of the conversation state.",
        "",
        "Continue the conversation by responding as the LLM.",
        "Do not reproduce wrapper tags in your response.",
        "",
    ]
    return "\n".join(header_lines)


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

