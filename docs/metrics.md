# Metrics

This project evaluates improvements from explicit conversation topology.
Phase 1 focuses on user-managed branching and deterministic transcript replay.
Phase 2 adds agent assistance and introduces additional automation metrics.

---

## 1. Baselines

All Phase 1 evaluations compare:

- **Linear Chat Baseline**: a single chronological message stream, with the same model and the same prompt format, but without branching.
- **Tree Orchestrator (Phase 1)**: message-level conversation tree with manual branching and transcript replay.

Unless stated otherwise:
- The same LLM is used for both systems.
- The same context/token budget policy is used.

---

## 2. Phase 1 Metrics

### 2.1 Task Success Rate (TSR)

**Definition:** Percentage of scenarios completed successfully.

Success criteria are scenario-specific (e.g., correct final answer, correct patch, passing tests, correct continuation).

TSR = successes / total_runs

---

### 2.2 Tokens-to-Success (TTS)

**Definition:** Total tokens consumed until success (prompt + completion), averaged over successful runs.

This captures cost and efficiency.

Report:
- mean TTS (successful runs)
- failure rate (runs that exceed budget or never reach success)

---

### 2.3 Continuation Correctness (CC)

**Goal:** Measure whether the system continues from the correct point after a user-initiated branch switch.

**Setup:** Scenarios include at least one non-trivial transition (branch creation or branch switch) followed by continued work.

**Definition:** After the transition, does the model produce the expected “next step” consistent with the chosen active path?

CC can be evaluated as:
- exact match (for structured outputs)
- validator-based (tests, assertions)
- judge-model scoring (semantic match) when required

Report CC as a percentage.

> Note: This is the Phase 1 analogue of “Return-to-Thread Accuracy” under manual branch control.

---

### 2.4 Context Pollution Rate (CPR)

**Goal:** Quantify interference from unrelated turns.

**Definition:** For each model call, measure the fraction of transcript tokens that are *not* on the active root→leaf path.

- Linear baseline: CPR is always 0 by definition (only one path exists)
- Tree orchestrator: CPR should be 0 by construction (only active path is replayed)

This metric mainly serves as an invariant verification:
- If CPR > 0, the orchestrator leaked context across branches.

---

### 2.5 User Navigation Efficiency (UNE) [Optional, UX-focused]

**Goal:** Measure whether users can find and resume prior states faster.

Measured in a controlled study by:
- time-to-locate a prior point
- number of navigation actions (clicks/steps)
- error rate (resuming wrong point)

This metric is optional for Phase 1 and can be added later.

---

### 2.6 Note Utility Metrics (NU)

Notes are user-authored and embedded in transcripts.
We measure whether notes improve continuity.

Suggested measures:

- **Note Adoption Rate (NAR):**
  How often users choose to create a note when prompted on a non-trivial transition.

- **Note Impact on CC:**
  Compare CC in scenarios with notes vs without notes (A/B within the tree system).

---

## 3. Phase 2 Metrics (Automation)

Phase 2 introduces agent assistance.
Additional metrics include:

### 3.1 Branch Suggestion Accuracy (BSA)

How often the agent correctly suggests:
- creating a branch
- switching branches
relative to scenario ground truth or human labels.

---

### 3.2 Note Suggestion Acceptance Rate (NSAR)

How often suggested notes are accepted by users.

---

### 3.3 User Intervention Reduction (UIR)

Reduction in manual actions compared to Phase 1, while maintaining or improving:
- TSR
- CC
- TTS

---

## 4. Reporting

For each benchmark suite:
- report mean and variance over multiple runs
- report budgets and model settings (temperature, max tokens)
- report failure modes separately
