# Conversation Orchestrator  
### A state orchestration layer for long-horizon LLM interactions

## Overview

Modern LLM-based systems treat conversations as linear token streams.  
While this works for short exchanges, it breaks down in long-horizon tasks involving:

- interruptions (e.g., debugging mid-task)
- clarifications and deep dives
- branching sub-goals
- constraint tracking over time
- multi-step agent workflows

This project proposes and implements a topology-aware conversation orchestration layer that models interaction as a hierarchical conversation tree with explicit return semantics, rather than a flat chat history.

Instead of sending the entire conversation back to the model, we:

- structure dialogue into branches
- maintain an explicit return stack
- isolate context per thread
- preserve decisions as structured state
- reconstruct only relevant context per step

The LLM remains unchanged.  
The improvement comes from state management and context selection.

---

## Core Idea

Conversation ≠ token stream  
Conversation = structured, hierarchical process

We introduce:

- Conversation Tree Model
- Return-to-Thread policy
- Branch lifecycle management
- Automatic branch detection
- Context assembly strategy
- State-aware evaluation metrics
- Topology-aware user interface primitives

This enables:

- deterministic recovery after interruptions
- automatic segmentation of sub-tasks
- improved constraint consistency
- reduced context waste
- structured conversational navigation
- measurable improvements in long-horizon task completion
- lower cognitive load for users

---

## Why This Matters

Current approaches rely on:

- full history replay
- truncation
- rolling summaries
- vector memory

These techniques address memory size, but not conversation topology.

We argue that topology-aware orchestration is a missing layer between:

LLM inference  
and  
agent runtime execution

---

## Research Questions

This project investigates:

1. Can explicit conversation topology improve return-to-task accuracy?
2. Does branch isolation reduce constraint violations?
3. Can we reduce token usage under fixed context budgets?
4. How should we evaluate long-horizon conversational coherence?

---

## Key Metric: Return-to-Thread Accuracy (RTA)

We introduce a new evaluation metric:

Return-to-Thread Accuracy (RTA)

After a branch (e.g., debugging or clarification) is resolved:
- Does the system return to the correct parent state?
- Does it continue from the correct step?
- Are prior constraints preserved?

This metric captures something not measured by standard benchmarks.

---

## Architecture

User Input  
   ↓  
Conversation Orchestrator  
   ├── Branch Policy  
   ├── State Store (Tree)  
   ├── Return Stack  
   ├── Context Assembler  
   ↓  
LLM  
   ↓  
Post-Response State Update  

The system is model-agnostic and operates as a runtime layer around any
LLM-based conversational or agent architecture.

---

## Roadmap

- [ ] Formal definition of Conversation Tree Model
- [ ] Implementation of Tree State Store
- [ ] Branch/Return policy engine
- [ ] Context assembly strategy
- [ ] Synthetic benchmark design
- [ ] Evaluation against linear chat baseline
- [ ] RTA and efficiency measurement

---

## License

Apache License 2.0

