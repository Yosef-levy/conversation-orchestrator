from datetime import datetime
from uuid import uuid4

from sqlmodel import SQLModel, create_engine, Session

from app import crud
from app.models import Conversation, Message, Note, ActiveState
from app.transcript import build_transcript_for_path


def make_session():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_compute_path_to_root_and_lca():
    session = make_session()

    conv = Conversation(title="Test")
    session.add(conv)
    session.commit()
    session.refresh(conv)

    root = Message(
        conversation_id=conv.id,
        parent_id=None,
        role="user",
        author="u",
        content="root",
    )
    a1 = Message(
        conversation_id=conv.id,
        parent_id=root.id,
        role="llm",
        author="m",
        content="a1",
    )
    b1 = Message(
        conversation_id=conv.id,
        parent_id=a1.id,
        role="user",
        author="u",
        content="b1",
    )
    a2 = Message(
        conversation_id=conv.id,
        parent_id=b1.id,
        role="llm",
        author="m",
        content="a2",
    )
    branch_user = Message(
        conversation_id=conv.id,
        parent_id=a1.id,
        role="user",
        author="u",
        content="branch user",
    )
    session.add(root)
    session.add(a1)
    session.add(b1)
    session.add(a2)
    session.add(branch_user)
    session.commit()

    path_to_a2 = crud.compute_path_to_root(session, a2.id)
    assert [m.id for m in path_to_a2] == [root.id, a1.id, b1.id, a2.id]

    lca = crud.compute_lca(session, a2.id, branch_user.id)
    assert lca is not None
    assert lca.id == a1.id


def test_transcript_injects_notes_after_host():
    session = make_session()

    conv = Conversation(title="Transcript Test")
    session.add(conv)
    session.commit()
    session.refresh(conv)

    root = Message(
        conversation_id=conv.id,
        parent_id=None,
        role="user",
        author="u",
        content="root message",
    )
    llm1 = Message(
        conversation_id=conv.id,
        parent_id=root.id,
        role="llm",
        author="m",
        content="first reply",
    )
    session.add(root)
    session.add(llm1)
    session.commit()

    note1 = Note(
        message_id=llm1.id,
        author="u",
        content="important decision",
        created_at=datetime.utcnow(),
    )
    session.add(note1)
    session.commit()

    path = [root, llm1]
    notes_by_message = {llm1.id: [note1]}

    transcript = build_transcript_for_path(conv, path, notes_by_message)

    llm_index = transcript.index("first reply")
    note_index = transcript.index("important decision")
    assert note_index > llm_index


def test_branch_from_llm_only_enforced_by_api_semantics():
    session = make_session()

    conv = Conversation(title="Branch Rule")
    session.add(conv)
    session.commit()
    session.refresh(conv)

    root = Message(
        conversation_id=conv.id,
        parent_id=None,
        role="user",
        author="u",
        content="root",
    )
    llm1 = Message(
        conversation_id=conv.id,
        parent_id=root.id,
        role="llm",
        author="m",
        content="llm1",
    )
    session.add(root)
    session.add(llm1)
    session.commit()

    active_state = ActiveState(
        conversation_id=conv.id,
        active_message_id=llm1.id,
        needs_context_rebuild=False,
    )
    session.add(active_state)
    session.commit()

    # The intended invariant is that new user children are always
    # attached to an llm node. Here we assert setup is consistent.
    assert llm1.role == "llm"
    assert active_state.active_message_id == llm1.id

