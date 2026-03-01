# Formal Model

This document defines the Phase 1.  
Phase 2 extends the same model with agent assistance but does not change the canonical structure.

---

## 1. Canonical Representation: Message-Level Tree

### 1.1 Nodes

A **node** represents a single message event.

Node types:
- `user`  — user message
- `llm`   — model response

Each node belongs to exactly one branch path from the root.

### 1.2 Edges

An edge represents a reply/continuation relationship:
- `parent_id -> node_id`

The conversation forms a rooted directed tree.

- Root is the first message in the session (typically a user message).
- Leaves represent active or terminal conversation continuations.

### 1.3 Branches

A **branch** is an alternative continuation created from a previous point in the tree.

**Phase 1 constraint (semantic + UX):**
- Branch creation explicitly by the user
- Branch creation is allowed **only from `llm` nodes**.

Rationale:
- Preserves alternating turn structure (user ↔ llm)
- Avoids “half-turn” continuations
- Matches common UX expectations (branching from answers)

---

## 2. Notes

### 2.1 What a Note Is

A **NOTE** is a user-authored annotation intended to:
- record a conclusion, decision, clarification, or fix
- make important information discoverable for humans
- be replayed into model context deterministically when relevant

Notes are not user messages and not LLM messages.
They are **attached metadata** that is **rendered into transcript** with explicit delimiters.

### 2.2 Storage Model

Notes are stored as an ordered list attached to a node.

In Phase 1, the user explicitly selects the node to which the Note is attached.

A Note minimally contains:
- `note_id`
- `created_at`
- `author` (user in phase 1)
- `text` (freeform but recommended template)

### 2.3 Rendering Notes into Transcript (Local Insertion)

When constructing a transcript for the model, notes are inserted **immediately after** the node they are attached to.

This is required because:
- notes often depend on local context
- inserting them at the top of transcript can remove the intended referent

Delimiter format:

`<<<NOTE>>>`   
`<note text>`  
`<<<END NOTE>>>`

---

## 3. Active Position and Navigation

### 3.1 Active Node

At any time, the system maintains an `active_node_id` indicating:
- where the user is currently “standing” in the tree
- which leaf/path is considered the active continuation

### 3.2 Transitions

A transition is any action that changes the active position or structure.

Two categories:

#### Trivial transition
- appending a new user message to the current active continuation
- receiving the next LLM response

#### Non-trivial transition
Any change that alters which path should be replayed, e.g.:
- switching to a different leaf/branch
- jumping to an ancestor node
- creating a new branch from a past `llm` node
- moving from one subtree to another

Non-trivial transitions require rebuilding the transcript before the next model call.

---

## 4. Context Rebuild Semantics

### 4.1 Rebuild Flag

The system maintains a boolean flag:

- `needs_context_rebuild: bool`

This flag is set to `true` when:
- a non-trivial transition occurs
- a NOTE is added/edited/removed on any node that lies on the active path
- a NOTE is added/edited/removed in general (simpler rule for Phase 1)

### 4.2 When Rebuild Happens

Rebuild does NOT immediately trigger a model call.

Rebuild is performed:
- **after the next user message is received**
- and **immediately before the next LLM call**

This avoids:
- unnecessary LLM calls
- unnecessary rebuild work during pure navigation

---

## 5. Transcript Construction (Phase 1)

### 5.1 Canonical Transcript

When calling the LLM, the input transcript is the linearized path:

`root -> ... -> active_node`

including:
- each message in alternating order
- notes inserted locally after their attached node

No summarization, relevance filtering, or memory selection is performed.  
The transcript is treated as the single source of truth.

### 5.2 User Message Handling

On user input:
1. Append a new `user` node as a child of `active_node_id`
2. Set this new node as the active node
3. If `needs_context_rebuild` is false, append the user message to the existing transcript
4. If `needs_context_rebuild` is true, rebuild transcript now and set `needs_context_rebuild` to false
5. Call LLM with transcript (which contains the latest user message)
6. Append resulting `llm` message to the transcript
7. Append resulting `llm` node as child of the new user node
8. Update active node to the new `llm` node

---

## 6. Note Creation Workflow (Phase 1)

### 6.1 Notes on Non-trivial Transition

On a non-trivial transition, the system may prompt the user:

- “Would you like to add a NOTE?”

If yes:
- user writes note text
- user chooses a target node to attach the note to

Default target suggestion:
- **LCA (Least Common Ancestor)** of the source node and destination node involved in the transition

User can override and attach the note anywhere in the tree.

### 6.2 Notes Without Transition

The user can create a NOTE at any time without switching branches.

In this case:
- the NOTE is attached to the selected node
- `needs_context_rebuild` is set to true
- rebuild happens only before the next model call (not immediately)

---

## 7. Phase 2 Extension Hooks (Not Implemented in Phase 1)

Phase 2 may introduce:

- Agent suggestions for branch creation
- Agent suggestions for NOTE creation and placement
- Agent suggestions for “you should switch back to branch X”
- Optional structured note templates or fields

Phase 2 must preserve:
- message-level canonical tree
- deterministic transcript replay semantics
- explicit user override capability
