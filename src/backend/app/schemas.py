from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ConversationSummary(BaseModel):
    id: UUID
    title: Optional[str]
    pinned: bool = False
    created_at: datetime
    updated_at: datetime


class ConversationCreate(BaseModel):
    message: str
    author: Optional[str] = None
    title: Optional[str] = None
    transcript: str  # Frontend-built: header + first user block, used for initial LLM call


class ConversationPatch(BaseModel):
    pinned: Optional[bool] = None


class ActiveStateResponse(BaseModel):
    active_message_id: UUID
    needs_context_rebuild: bool


class MessageNode(BaseModel):
    id: UUID
    parent_id: Optional[UUID]
    role: str
    author: str
    content: str
    message_title: Optional[str]
    created_at: datetime


class NoteItem(BaseModel):
    id: UUID
    message_id: UUID
    author: str
    content: str
    created_at: datetime


class ConversationTreeResponse(BaseModel):
    messages: list[MessageNode]
    notes: dict[UUID, list[NoteItem]]
    active_state: ActiveStateResponse
    conversation_title: Optional[str] = None  # For frontend transcript header


class SetActiveRequest(BaseModel):
    message_id: UUID


class NoteCreateRequest(BaseModel):
    message_id: UUID
    content: str
    author: Optional[str] = None


class CheckpointCreateRequest(BaseModel):
    message_id: UUID
    checkpoint_name: str


class MessageTitleRequest(BaseModel):
    message_id: UUID
    title: Optional[str] = None


class UserMessageCreateRequest(BaseModel):
    content: str
    author: Optional[str] = None
    transcript: str  # Frontend-built: full transcript including new user block, used for LLM call


class UserMessageResponse(BaseModel):
    user_message_id: UUID
    llm_message_id: UUID
    llm_content: str
    append_chunk: str  # Serialized user + LLM blocks for frontend transcript cache
    user_created_at: datetime
    llm_created_at: datetime


class NoteCreateResponse(BaseModel):
    note_id: UUID
    message_id: UUID
    author: str
    content: str
    created_at: datetime

