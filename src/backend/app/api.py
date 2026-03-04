from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from . import crud
from .db import get_session
from .llm import LLMClient
from .models import Conversation, Message, Note, ActiveState
from .schemas import (
    ActiveStateResponse,
    ConversationCreate,
    ConversationPatch,
    ConversationSummary,
    ConversationTreeResponse,
    MessageNode,
    MessageTitleRequest,
    NoteCreateRequest,
    NoteCreateResponse,
    NoteItem,
    SetActiveRequest,
    UserMessageCreateRequest,
    UserMessageResponse,
)
from .transcript import build_transcript_for_path, get_transcript_header_static, serialize_message_block


router = APIRouter()
llm_client = LLMClient()


@router.get("/config/transcript-header")
def get_transcript_header_config():
    """Return the static part of the transcript header (single source of truth for BE and FE)."""
    return {"static_part": get_transcript_header_static()}


@router.get("/conversations", response_model=List[ConversationSummary])
def list_conversations(
    session: Session = Depends(get_session),
) -> List[ConversationSummary]:
    conversations = crud.list_conversations(session)
    # Normalize to plain types so JSON serialization never fails (SQLite/ORM can return odd types)
    out = []
    for c in conversations:
        _id = c.id
        if not isinstance(_id, str) and hasattr(_id, "__str__"):
            _id = str(_id)
        _created = c.created_at
        _updated = c.updated_at
        if hasattr(_created, "isoformat"):
            _created = _created.isoformat()
        if hasattr(_updated, "isoformat"):
            _updated = _updated.isoformat()
        out.append(
            ConversationSummary(
                id=_id,
                title=c.title,
                pinned=getattr(c, "pinned", False),
                created_at=_created,
                updated_at=_updated,
            )
        )
    return out


@router.post("/conversations")
async def create_conversation(
    body: ConversationCreate, session: Session = Depends(get_session)
):
    author = body.author or "end_user"

    conversation = Conversation(title=body.title)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    root_msg = Message(
        conversation_id=conversation.id,
        parent_id=None,
        role="user",
        author=author,
        content=body.message,
    )
    session.add(root_msg)
    session.commit()
    session.refresh(root_msg)

    llm_response = await llm_client.complete(body.transcript)

    llm_msg = Message(
        conversation_id=conversation.id,
        parent_id=root_msg.id,
        role="llm",
        author="stub-echo",
        content=llm_response.content,
    )
    session.add(llm_msg)

    active_state = ActiveState(
        conversation_id=conversation.id,
        active_message_id=llm_msg.id,
        needs_context_rebuild=False,
    )
    session.add(active_state)

    conversation.updated_at = datetime.utcnow()

    session.commit()

    return {"conversation_id": conversation.id}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str, session: Session = Depends(get_session)
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    crud.delete_conversation(session, conv_id)
    session.commit()
    return {"status": "deleted"}


@router.patch("/conversations/{conversation_id}")
def patch_conversation(
    conversation_id: str,
    body: ConversationPatch,
    session: Session = Depends(get_session),
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    if body.pinned is not None:
        crud.set_conversation_pinned(session, conv_id, body.pinned)
    session.commit()
    return {"status": "ok"}


@router.get("/conversations/{conversation_id}/tree", response_model=ConversationTreeResponse)
def get_conversation_tree(
    conversation_id: str, session: Session = Depends(get_session)
) -> ConversationTreeResponse:
    from uuid import UUID

    conv_id = UUID(conversation_id)
    conversation = crud.get_conversation(session, conv_id)

    stmt = select(Message).where(Message.conversation_id == conv_id)
    messages = list(session.exec(stmt))

    notes_by_message = crud.get_notes_by_message(session, conv_id)

    active_state = crud.get_active_state(session, conv_id)

    message_nodes = [
        MessageNode(
            id=m.id,
            parent_id=m.parent_id,
            role=m.role,
            author=m.author,
            content=m.content,
            message_title=m.message_title,
            created_at=m.created_at,
        )
        for m in messages
    ]

    notes_payload: dict = {}
    for msg_id, notes in notes_by_message.items():
        notes_payload[msg_id] = [
            NoteItem(
                id=n.id,
                message_id=n.message_id,
                author=n.author,
                content=n.content,
                created_at=n.created_at,
            )
            for n in notes
        ]

    active_payload = ActiveStateResponse(
        active_message_id=active_state.active_message_id,
        needs_context_rebuild=active_state.needs_context_rebuild,
    )

    return ConversationTreeResponse(
        messages=message_nodes,
        notes=notes_payload,
        active_state=active_payload,
        conversation_title=conversation.title,
    )


@router.post("/conversations/{conversation_id}/active")
def set_active_message(
    conversation_id: str,
    body: SetActiveRequest,
    session: Session = Depends(get_session),
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    active_state = crud.get_active_state(session, conv_id)

    message = session.get(Message, body.message_id)
    if message is None or message.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Invalid message_id")

    active_state.active_message_id = body.message_id
    active_state.needs_context_rebuild = True

    session.add(active_state)
    session.commit()

    return {"status": "ok"}


@router.post("/conversations/{conversation_id}/notes", response_model=NoteCreateResponse)
def add_note(
    conversation_id: str,
    body: NoteCreateRequest,
    session: Session = Depends(get_session),
) -> NoteCreateResponse:
    from uuid import UUID

    conv_id = UUID(conversation_id)
    message = session.get(Message, body.message_id)
    if message is None or message.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Invalid message_id")

    author = body.author or "end_user"
    note = Note(
        message_id=body.message_id,
        author=author,
        content=body.content,
    )
    session.add(note)

    active_state = crud.get_active_state(session, conv_id)
    active_state.needs_context_rebuild = True
    session.add(active_state)

    session.commit()
    session.refresh(note)

    return NoteCreateResponse(
        note_id=note.id,
        message_id=note.message_id,
        author=note.author,
        content=note.content,
        created_at=note.created_at,
    )


@router.post("/conversations/{conversation_id}/checkpoints")
def set_checkpoint(
    conversation_id: str,
    body: CheckpointCreateRequest,
    session: Session = Depends(get_session),
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    message = session.get(Message, body.message_id)
    if message is None or message.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Invalid message_id")

    message.checkpoint_name = body.checkpoint_name
    session.add(message)
    session.commit()

    # Does NOT set rebuild, per spec.
    return {"status": "ok"}


@router.post("/conversations/{conversation_id}/message-title")
def set_message_title(
    conversation_id: str,
    body: MessageTitleRequest,
    session: Session = Depends(get_session),
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    message = session.get(Message, body.message_id)
    if message is None or message.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Invalid message_id")

    message.message_title = body.title
    session.add(message)
    session.commit()

    return {"status": "ok"}


@router.post("/conversations/{conversation_id}/message", response_model=UserMessageResponse)
async def post_user_message(
    conversation_id: str,
    body: UserMessageCreateRequest,
    session: Session = Depends(get_session),
) -> UserMessageResponse:
    from uuid import UUID

    conv_id = UUID(conversation_id)
    conversation = crud.get_conversation(session, conv_id)
    active_state = crud.get_active_state(session, conv_id)

    active_message = session.get(Message, active_state.active_message_id)
    if active_message is None or active_message.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Invalid active message")
    if active_message.role != "llm":
        raise HTTPException(
            status_code=400, detail="Active message must be an llm node"
        )

    author = body.author or "end_user"

    user_msg = Message(
        conversation_id=conv_id,
        parent_id=active_message.id,
        role="user",
        author=author,
        content=body.content,
    )
    session.add(user_msg)
    session.commit()
    session.refresh(user_msg)

    if active_state.needs_context_rebuild:
        active_state.needs_context_rebuild = False

    # Frontend sends full transcript (including new user block); we only call the LLM.
    llm_response = await llm_client.complete(body.transcript)

    llm_msg = Message(
        conversation_id=conv_id,
        parent_id=user_msg.id,
        role="llm",
        author="stub-echo",
        content=llm_response.content,
    )
    session.add(llm_msg)

    active_state.active_message_id = llm_msg.id

    conversation.updated_at = datetime.utcnow()

    session.add(active_state)
    session.add(conversation)
    session.commit()
    session.refresh(llm_msg)

    user_block = serialize_message_block(user_msg, [])
    llm_block = serialize_message_block(llm_msg, [])
    append_chunk = user_block + "\n\n" + llm_block

    return UserMessageResponse(
        user_message_id=user_msg.id,
        llm_message_id=llm_msg.id,
        llm_content=llm_msg.content,
        append_chunk=append_chunk,
        user_created_at=user_msg.created_at,
        llm_created_at=llm_msg.created_at,
    )


@router.get("/conversations/{conversation_id}/transcript")
def get_transcript(
    conversation_id: str,
    session: Session = Depends(get_session),
):
    from uuid import UUID

    conv_id = UUID(conversation_id)
    conversation = crud.get_conversation(session, conv_id)
    active_state = crud.get_active_state(session, conv_id)

    path = crud.compute_path_to_root(session, active_state.active_message_id)
    notes_by_message = crud.get_notes_by_message(session, conv_id)
    transcript = build_transcript_for_path(conversation, path, notes_by_message)

    return {"transcript": transcript}

