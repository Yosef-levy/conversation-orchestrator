from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    title: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    conversation_id: UUID = Field(foreign_key="conversations.id", index=True)
    parent_id: Optional[UUID] = Field(default=None, foreign_key="messages.id")
    role: str = Field(index=True)  # "user" | "llm"
    author: str
    content: str
    message_title: Optional[str] = Field(default=None)
    checkpoint_name: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Note(SQLModel, table=True):
    __tablename__ = "notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    message_id: UUID = Field(foreign_key="messages.id", index=True)
    author: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ActiveState(SQLModel, table=True):
    __tablename__ = "active_state"

    conversation_id: UUID = Field(
        foreign_key="conversations.id", primary_key=True
    )
    active_message_id: UUID = Field(foreign_key="messages.id")
    needs_context_rebuild: bool = Field(default=False)

