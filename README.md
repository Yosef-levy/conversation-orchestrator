# Conversation Orchestrator  
### A state orchestration layer for long-horizon LLM interactions

---

## Overview

Modern LLM-based systems treat conversations as linear token streams.

This works for short exchanges but breaks down in long-horizon tasks involving:

- interruptions (e.g., debugging mid-task)
- rewinding and exploring alternative directions
- clarifications of earlier answers
- extended multi-step reasoning
- iterative refinement over time

The core limitation is not memory size.  
It is conversation topology.

This project introduces a runtime layer that models interaction as a **branching message tree** rather than a flat chat log.

The LLM remains unchanged.  
Improvements come from explicit topology, structured navigation, and controlled context replay.

---

## Core Idea

Conversation ≠ token stream  
Conversation = structured branching process

Instead of replaying a single linear history, we:

- Represent conversation as a message tree
- Allow the user to select the active node (the message from which continuation proceeds)
- Allow controlled branching
- Replay only the selected path
- Insert explicit structured notes when needed

Topology is explicit.  
State is inspectable.  
Continuation is controlled.

---

## Canonical Model: Message-Level Branching

The canonical structure is a **tree of messages**.

- Each node represents a single message (User or LLM).
- Edges represent reply-to relationships.
- Branches represent alternative continuations from a previous LLM message.

Branches are not just sub-tasks —  
they allow:

- Rewinding to an earlier model answer
- Exploring an alternative direction
- Recovering from drift
- Comparing reasoning paths

Branch creation is allowed only from LLM messages.

This ensures:

- Clean alternating structure (User → LLM → User → LLM)
- Logical branching from model outputs
- Predictable conversation flow

---

## Manual Notes (Structured Carry-Over)

To preserve important conclusions across branches, we introduce **NOTES**.

A NOTE:

- Is attached to a specific message in the tree
- Is included during transcript replay
- Is not a User message
- Is not an LLM message
- Is explicitly marked and delimited

Example format:
```yaml
<<<NOTE>>>
Decision: Do not use library X.
Reason: It introduces heavy dependency overhead.
Implication: Future solutions must avoid library X.
<<<END NOTE>>>
```

When selecting a new active node, the user is prompted:

> Do you want to create a NOTE?

If yes:
- The user writes the note.
- The user selects where it should be attached.
- Default target: the Lowest Common Ancestor (LCA) of the transition.

The user can also create a NOTE manually without performing a non-trivial transition.  
In this case, the note must still be attached to a specific message node.

Notes become part of the transcript and are replayed in future context assembly.

There is no hidden memory layer.

---

## Phase 1 – User-Managed Topology (MVP)

In Phase 1:

- Users manually create branches from any LLM message.
- Users manually select the active node (where continuation occurs).
- The system does not automatically detect branches.
- No model-assisted orchestration is used.

When selecting a new active node or adding a NOTE to the current path:

- A new clean LLM session is started.
- The full transcript from root → selected node, including attached NOTES, is replayed.
- The new user input is appended.

This guarantees:

- Deterministic context reconstruction
- Isolation between alternative branches
- No hidden state outside the tree

---

## Phase 2 – Agent-Assisted Orchestration

Phase 2 builds on the canonical tree by introducing optional automation:

- Branch suggestions
- Resolution detection
- Suggested NOTES
- Suggested NOTE targets
- Hybrid orchestration (LLM advisory + deterministic runtime)

User control remains authoritative.

---

## Key Metric: Return-to-Thread Accuracy (RTA)

RTA evaluates the orchestration layer, not the model's intrinsic reasoning ability.  
RTA measures whether the system:

- Correctly resumes from a chosen branch
- Preserves prior constraints
- Avoids unintended drift after rewinding

This captures recovery quality — a dimension not measured in standard chat benchmarks.

---

## Project layout

- **`src/backend/`** — FastAPI app, SQLModel/SQLite, transcript builder, Phase 1 REST API. Run from here: `uvicorn app.main:app`, tests: `pytest`.
- **`src/frontend/`** — React + Vite + TypeScript UI (tree view, conversation list). Run from here: `npm install && npm run dev`.

### Running with vLLM (e.g. Qwen2.5-14B)

By default the backend uses a **stub** LLM (echo). To use a real model without per-token cost, run **vLLM** locally and point the backend at it.

1. **Start vLLM** on port **8001** (so the backend can keep using 8000). For **24GB VRAM** use the AWQ-quantized model (full-precision 14B needs ~28GB and leaves no room for the KV cache):

   ```bash
   pip install vllm
   vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --port 8001
   ```

   For 32GB+ VRAM you can use full precision: `vllm serve Qwen/Qwen2.5-14B-Instruct --dtype auto --port 8001`

2. **Configure the backend** (in `src/backend/.env` or env):

   ```bash
   LLM_PROVIDER=vllm
   LLM_VLLM_BASE_URL=http://localhost:8001
   LLM_VLLM_MODEL=Qwen/Qwen2.5-14B-Instruct-AWQ
   LLM_MAX_TOKENS=2048
   ```

3. Start the backend and frontend as usual. The orchestrator will call vLLM’s OpenAI-compatible `/v1/completions` endpoint with the full transcript as the prompt.

   **Conda/mamba:** Use the repo’s `environment.yml` (includes `vllm`). Create the env, then run `vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --port 8001` (or full-precision 14B if you have 32GB+). See comments in `environment.yml`.

### One-command dev stack (Docker + frontend)

To start backend, vLLM, and frontend with one command (and stop them with another):

```bash
./scripts/start.sh   # starts Docker (backend + vLLM), frontend dev server, opens browser
./scripts/stop.sh    # stops frontend and Docker services
```

Requires Docker with GPU support (nvidia-container-toolkit) for vLLM. Uses `docker-compose.dev.yml` and `Dockerfile.backend`. To start only the frontend (e.g. backend/vLLM already running): `SKIP_DOCKER=1 ./scripts/start.sh`. To stop only the frontend: `SKIP_DOCKER=1 ./scripts/stop.sh`.

---

## Architecture (Phase 1)

User Input  
   ↓  
Conversation Orchestrator  
   ├── Message Tree Store  
   ├── Active Node Pointer  
   ├── Branch Creation (LLM-only origin)  
   ├── NOTE Insertion Logic  
   ├── Context Replay Engine  
   ↓  
LLM  
   ↓  
Append LLM's answer to Active Branch and update Active Node Pointer  

Model-agnostic.  
Stateless at the model level.  
All structure lives in the orchestration layer.

---

## Roadmap

### Phase 1
- [ ] Message-level tree implementation
- [ ] Branch-from-LLM restriction
- [ ] Active node switching
- [ ] Clean session replay on active node change or adding a NOTE to the current path
- [ ] Manual NOTE creation + LCA targeting
- [ ] Baseline vs tree evaluation

### Phase 2
- [ ] Branch detection heuristics
- [ ] Agent-assisted NOTE suggestions
- [ ] Resolution detection
- [ ] Hybrid orchestration
- [ ] Comparative evaluation

---

## License

Apache License 2.0
