"""
API tests for REST endpoints.

Covers response shapes required for frontend tree-patching (created_at, note fields),
branch-from-LLM enforcement (400 when active is not LLM), and rebuild-flag semantics.
"""
from unittest.mock import AsyncMock, patch

from app.api import llm_client
from app.llm import LLMResponse


def _minimal_transcript(user_message: str) -> str:
    """Minimal transcript so stub LLM can echo the last user message."""
    return (
        "Conversation\n\n"
        "You are given a structured conversation transcript.\n\n"
        "<<<USER>>>\n"
        f"{user_message}\n"
        "<<<END USER>>>"
    )


class TestPostMessageResponseShape:
    """POST /conversations/{id}/message returns fields needed for frontend to patch tree."""

    @patch.object(llm_client, "complete", new_callable=AsyncMock)
    def test_post_message_returns_user_and_llm_created_at(self, mock_complete, client):
        mock_complete.return_value = LLMResponse(content="echoed")

        # Create conversation (stub is called once)
        create_body = {
            "message": "first",
            "author": "end_user",
            "title": "Test",
            "transcript": _minimal_transcript("first"),
        }
        create_resp = client.post("/conversations", json=create_body)
        assert create_resp.status_code == 200
        conv_id = create_resp.json()["conversation_id"]

        # Post second message
        msg_body = {
            "content": "second",
            "author": "end_user",
            "transcript": _minimal_transcript("first") + "\n\n<<<USER>>>\nsecond\n<<<END USER>>>",
        }
        msg_resp = client.post(f"/conversations/{conv_id}/message", json=msg_body)
        assert msg_resp.status_code == 200
        data = msg_resp.json()

        assert "user_message_id" in data
        assert "llm_message_id" in data
        assert data["llm_content"] == "echoed"
        assert "append_chunk" in data
        assert "user_created_at" in data
        assert "llm_created_at" in data
        # ISO-like datetimes
        assert "T" in data["user_created_at"] or "-" in data["user_created_at"]
        assert "T" in data["llm_created_at"] or "-" in data["llm_created_at"]

    @patch.object(llm_client, "complete", new_callable=AsyncMock)
    def test_post_message_400_when_active_not_llm(self, mock_complete, client):
        """Branch-from-LLM: posting a message when active node is user must return 400."""
        mock_complete.return_value = LLMResponse(content="irrelevant")

        create_body = {
            "message": "only",
            "author": "end_user",
            "transcript": _minimal_transcript("only"),
        }
        create_resp = client.post("/conversations", json=create_body)
        assert create_resp.status_code == 200
        conv_id = create_resp.json()["conversation_id"]

        # Get tree to find root (user) message id
        tree_resp = client.get(f"/conversations/{conv_id}/tree")
        assert tree_resp.status_code == 200
        tree = tree_resp.json()
        root_msg = next(m for m in tree["messages"] if m["parent_id"] is None)
        assert root_msg["role"] == "user"

        # Set active to root (user node) — invalid for posting message
        client.post(f"/conversations/{conv_id}/active", json={"message_id": root_msg["id"]})

        msg_body = {
            "content": "will fail",
            "author": "end_user",
            "transcript": _minimal_transcript("only") + "\n\n<<<USER>>>\nwill fail\n<<<END USER>>>",
        }
        msg_resp = client.post(f"/conversations/{conv_id}/message", json=msg_body)
        assert msg_resp.status_code == 400
        assert "llm" in msg_resp.json().get("detail", "").lower()


class TestPostNotesResponseShape:
    """POST /conversations/{id}/notes returns full note so frontend can patch tree."""

    @patch.object(llm_client, "complete", new_callable=AsyncMock)
    def test_post_notes_returns_note_id_message_id_author_content_created_at(self, mock_complete, client):
        mock_complete.return_value = LLMResponse(content="ok")

        create_body = {
            "message": "hi",
            "transcript": _minimal_transcript("hi"),
        }
        create_resp = client.post("/conversations", json=create_body)
        assert create_resp.status_code == 200
        conv_id = create_resp.json()["conversation_id"]

        tree_resp = client.get(f"/conversations/{conv_id}/tree")
        tree = tree_resp.json()
        llm_msg = next(m for m in tree["messages"] if m["role"] == "llm")

        note_resp = client.post(
            f"/conversations/{conv_id}/notes",
            json={"message_id": llm_msg["id"], "content": "a note", "author": "end_user"},
        )
        assert note_resp.status_code == 200
        data = note_resp.json()

        assert data["message_id"] == llm_msg["id"]
        assert "note_id" in data
        assert data["author"] == "end_user"
        assert data["content"] == "a note"
        assert "created_at" in data
        assert "T" in data["created_at"] or "-" in data["created_at"]


class TestSetActiveRebuildFlag:
    """POST /conversations/{id}/active sets needs_context_rebuild = True."""

    @patch.object(llm_client, "complete", new_callable=AsyncMock)
    def test_set_active_sets_needs_context_rebuild_true(self, mock_complete, client):
        mock_complete.return_value = LLMResponse(content="r1")

        create_body = {
            "message": "m1",
            "transcript": _minimal_transcript("m1"),
        }
        create_resp = client.post("/conversations", json=create_body)
        conv_id = create_resp.json()["conversation_id"]

        # Post one more message so we have two LLM nodes
        tree0 = client.get(f"/conversations/{conv_id}/tree").json()
        active_llm = next(m for m in tree0["messages"] if m["role"] == "llm")
        msg_body = {
            "content": "m2",
            "transcript": _minimal_transcript("m1") + "\n\n<<<USER>>>\nm2\n<<<END USER>>>",
        }
        client.post(f"/conversations/{conv_id}/message", json=msg_body)

        tree1 = client.get(f"/conversations/{conv_id}/tree").json()
        assert tree1["active_state"]["needs_context_rebuild"] is False

        # Switch active back to first LLM
        client.post(f"/conversations/{conv_id}/active", json={"message_id": active_llm["id"]})

        tree2 = client.get(f"/conversations/{conv_id}/tree").json()
        assert tree2["active_state"]["active_message_id"] == active_llm["id"]
        assert tree2["active_state"]["needs_context_rebuild"] is True
