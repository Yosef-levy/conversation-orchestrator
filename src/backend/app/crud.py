from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from sqlmodel import Session, select

from .models import Conversation, Message, Note, ActiveState


def get_conversation(session: Session, conversation_id: UUID) -> Conversation:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise ValueError("Conversation not found")
    return conversation


def list_conversations(session: Session) -> List[Conversation]:
    stmt = select(Conversation).order_by(Conversation.updated_at.desc())
    return list(session.exec(stmt))


def get_active_state(session: Session, conversation_id: UUID) -> ActiveState:
    state = session.get(ActiveState, conversation_id)
    if state is None:
        raise ValueError("Active state not found")
    return state


def compute_path_to_root(
    session: Session, message_id: UUID
) -> List[Message]:
    """
    Compute path from root → node by following parent pointers.
    """
    path: List[Message] = []
    current = session.get(Message, message_id)
    if current is None:
        raise ValueError("Message not found")

    while current is not None:
        path.append(current)
        if current.parent_id is None:
            break
        current = session.get(Message, current.parent_id)

    path.reverse()
    return path


def compute_lca(
    session: Session, message_a_id: UUID, message_b_id: UUID
) -> Optional[Message]:
    """
    Compute Least Common Ancestor of two messages.
    """
    ancestors_a: set[UUID] = set()
    current_a = session.get(Message, message_a_id)
    while current_a is not None:
        ancestors_a.add(current_a.id)
        if current_a.parent_id is None:
            break
        current_a = session.get(Message, current_a.parent_id)

    current_b = session.get(Message, message_b_id)
    while current_b is not None:
        if current_b.id in ancestors_a:
            return current_b
        if current_b.parent_id is None:
            break
        current_b = session.get(Message, current_b.parent_id)

    return None


def get_notes_by_message(
    session: Session, conversation_id: UUID
) -> dict[UUID, list[Note]]:
    stmt = select(Note).join(Message).where(
        Message.conversation_id == conversation_id
    )
    notes = list(session.exec(stmt))
    notes_by_message: dict[UUID, list[Note]] = {}
    for note in notes:
        notes_by_message.setdefault(note.message_id, []).append(note)
    return notes_by_message

