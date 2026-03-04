# Implementation Plan (Phase 1 for now)

This document is the engineering contract for implementation.
It complements `formal_model.md` by specifying:

- development stack
- data model (DB schema)
- runtime invariants
- API surface
- core algorithms (path, LCA, transcript rebuild)
- rebuild flag semantics

Phase 1 is strict: no automation, no summarization, no semantic retrieval.

---

## 1. Stack

### Backend

- Language: Python 3.11+
- Framework: FastAPI
- DB: SQLite
- ORM: SQLModel
- Tests: pytest

### Frontend

- React + Vite + TypeScript
- Tree visualization: React Flow
- Styling: minimal (CSS)

---

## 2. Terminology (Phase 1)

This section is a convenience summary only.  
In case of any interpretational conflict between the definitions provided here and those specified in `formal_model.md`, the latter shall be considered authoritative, and all implementation decisions must conform to it.

- Conversation: a container for a message-level tree.
- Message: a single turn node in the tree.
- Branch: an alternative continuation created from an existing LLM message node.
- Active Node: the message node from which the next user message will continue.
- NOTE: a metadata item attached to a message node (not a message node).
- Non-trivial transition: switching active node to anything other than the current leaf continuation.

---

## 3. Core Invariants (Phase 1)

This section restates the implementation-level invariants derived directly from `formal_model.md`.  
It does not introduce new semantics, but makes explicit the guarantees that must hold at the application and database layers.

### I1 — Canonical Tree

The canonical structure is a message-level tree.
Each node is exactly one message:

- role = `user` or `llm`

### I2 — Branch-from-LLM Only

A branch can only be created from nodes where role == `llm`.

### I3 — User Message Append Rule

When posting a new user message:

- The current active node MUST be an `llm` node.
- The new user message becomes a child of the active `llm` node.
- The assistant response becomes a child of that user message.

### I4 — Notes Are Not Nodes

NOTES are not part of the message tree.
They are attached to a host message node and are injected into the transcript locally.

### I5 — Rebuild Flag Semantics

Non-trivial transitions do not immediately rebuild context.
They only set `needs_context_rebuild = True`.

The transcript rebuild occurs ONLY:

- after the next user message is received
- immediately before calling the LLM
Then set `needs_context_rebuild = False`.

---

## 4. Data Model (SQLite)

### 4.1 conversations

- id (UUID, PK)
- title (TEXT, nullable)
- created_at (DATETIME)
- updated_at (DATETIME, for sorting)

### 4.2 messages (canonical tree)

- id (UUID, PK)
- conversation_id (UUID, FK → conversations.id)
- parent_id (UUID, FK → messages.id, nullable for root)
- role (TEXT, enum-like: `user` | `llm`)
- author (TEXT, free string; e.g. `end_user`, `gpt-5.2`, `agent`, `tool:<name>`)
- content (TEXT)
- message_title (TEXT, nullable)
- created_at (DATETIME)

Clarification:

- Do NOT enforce alternation via DB constraints; enforce in application logic.

### 4.3 notes

- id (UUID, PK)
- message_id (UUID, FK → messages.id)
- author (TEXT; Phase 1 typically `end_user`)
- content (TEXT)
- created_at (DATETIME)

### 4.4 active_state (singleton per conversation)

- conversation_id (UUID, PK, FK → conversations.id)
- active_message_id (UUID, FK → messages.id)
- needs_context_rebuild (BOOLEAN)

---

## 5. Core Algorithms

### 5.1 Path: root → node

Given `message_id`, compute the unique path to root by following parent pointers.
Return ordered list from root to node.

### 5.2 LCA (Least Common Ancestor)

Given `message_id_a`, `message_id_b`:

- compute ancestors of `a` into a set
- traverse ancestors of `b` until found in set
Return that message_id.

Used only for UX default target suggestion when attaching a NOTE during non-trivial switch.

### 5.3 Transcript Builder (Phase 1 canonical)

Input:

- active_message_id

Output:

- a single text transcript representing the root→active path,  
with NOTES inserted immediately after their host message.  
Multiple NOTES attached to the same message are serialized in ascending created_at order (tie-breaker: id).

Formatting:

- Exactly one blank line between each block.
- Messages are serialized as alternating blocks with `role` wrapper:
  ```
  <<<USER>>>
  <content>
  <<<END USER>>>

  <<<LLM>>>
  <content>
  <<<END LLM>>>
  ```
- NOTES inserted locally after the message they attached to:
  ```
  <<<host message role>>>
  <host message content>
  <<<END host message role>>>

  <<<NOTE>>>
  <note 1 content>
  <<<END NOTE>>>

  <<<NOTE>>>
  <note 2 content>
  <<<END NOTE>>>

  <<<next message role>>>
  <next message content>
  <<<END next message role>>>
  ```
- Before serialization, any occurrence of wrapper tags inside message or note content must be escaped (e.g., replaced with << <).
- The transcript starts with the following header:

```
<conversation.title>

You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state.

Continue the conversation by responding as the LLM.
Do not reproduce wrapper tags in your response.
```

No summarization.
No relevance filtering.

---

## 6. Non-trivial Transitions (Phase 1)

The following actions MUST set `needs_context_rebuild = True`:

- switching the active node due to user navigation (manual selection, not the automatic progression after posting a message)
- adding a NOTE to any node

Actions that do NOT require rebuild:

- setting checkpoint_name
- viewing the tree

Rebuild is deferred until the next user message.

---

## 7. Minimal REST API (Phase 1)

### GET /conversations

Returns:
- a list of conversations (metadata only):
  - items: [{id, title, created_at, updated_at}]

### GET /conversations/{id}/tree

Returns:

- messages (nodes)
- edges (parent_id links)
- notes grouped by message_id (sorted by creation time)
- active_state (active_message_id, needs_context_rebuild)

### POST /conversations

Body: {  
  message: string,
  author?: string,
  title?: string
}

Behavior:

1. Create conversation:
  - title = provided title
2. Create root user message:
  - role = "user"
  - author = provided author or "end_user"
  - parent_id = null
  - content = message
3. Build transcript (root only)
4. Call LLM
5. Create llm reply as child of root:
  - role = "llm"
  - author = model identifier (e.g. "gpt-5.2" or configured provider name)
  - parent_id = root message id
6. Create active_state entry:
  - conversation_id = conversation_id
  - active_message_id = llm reply id
  - needs_context_rebuild = False

Returns:

- conversation_id

### POST /conversations/{id}/active

Body: {message_id}
Behavior:

- active_message_id = message_id
- needs_context_rebuild = True

### POST /conversations/{id}/notes

Body: {
  message_id,
  content: string,
  author?: string
}

Behavior:

- create note attached to message_id
- needs_context_rebuild = True

Returns (so the frontend can patch the tree without GET /tree):

- note_id, message_id, author, content, created_at (ISO datetime string)

### POST /conversations/{id}/checkpoints

Body: {message_id, checkpoint_name}
Behavior:

- update message.checkpoint_name
- does NOT set rebuild

### POST /conversations/{id}/message

Body: {
  content: string,
  author?: string,
  transcript: string
}

The client sends the transcript it will use (either rebuilt from tree when needs_context_rebuild, or cached transcript + new user block).

Behavior:

1. Validate active node exists and role == `llm`. If not, return 400.
2. If needs_context_rebuild == True:
  - build transcript from root→active using Transcript Builder
  - Set needs_context_rebuild = False.
  - (optionally return transcript in response for debug)

3. Append user message as child of active llm message.
4. Append user message to the transcript.
5. Call LLM (Phase 1 can use stub implementation).
6. Append llm reply as child of user message.
7. Append llm reply to the transcript.

Returns (so the frontend can patch the tree without GET /tree):

- user_message_id, llm_message_id
- llm_content, append_chunk (transcript suffix to append)
- user_created_at, llm_created_at (ISO datetime strings)

### GET /conversations/{id}/transcript

Returns the transcript for root→active path (debug endpoint).

### Client tree updates (frontend)

The frontend keeps a local copy of the tree. After **send message**, **add note**, **set active**, or **set message title**, it patches the tree in state using the API response and does **not** call GET /tree. GET /tree is used only when **selecting a conversation** (load or switch). The response shapes above (created_at and note fields) are defined so the client can patch correctly.

---

## 8. LLM Integration

Phase 1 can start with a stub adapter:

- returns deterministic text for development

Later replace with real providers:

- OpenAI / local model adapters

The orchestrator must treat the LLM as stateless:

- every call includes the transcript text + new user message.

---

## 9. Phase 2 Extensions (Non-goals for Phase 1)

Phase 2 may add:

- agent-assisted suggestions (branch, note draft, note target)
- automatic detection of non-trivial transitions
- metrics collection tables
- multi-user/auth

None of the above are required in Phase 1 MVP.

---

## 10. Cursor / AI Coding Rules (Project Guardrails)

When using AI tools to generate code:

- Follow this document strictly.
- Do not add summarization, embeddings, semantic retrieval, or constraint extraction in Phase 1.
- Do not add DB triggers/check constraints in Phase 1.
- Keep endpoints minimal; avoid premature abstractions.
- Add tests for:
  - path + LCA (`test_crud_and_transcript`)
  - branch-from-LLM enforcement (API: POST /message returns 400 when active is not LLM; `test_api`)
  - transcript NOTE injection (`test_crud_and_transcript`)
  - rebuild-flag defer semantics (API: set active sets `needs_context_rebuild = True`; `test_api`)
  - API response shapes for client tree-patching: POST /message returns `user_created_at`, `llm_created_at`; POST /notes returns `note_id`, `message_id`, `author`, `content`, `created_at` (`test_api`)
- Optional: frontend unit tests for tree-patch helpers (patchTreeAfterSend, patchTreeAfterNote, etc.) and for “waiting for LLM” disabling switch/create/note/title.

