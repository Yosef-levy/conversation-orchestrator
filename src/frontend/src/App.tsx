import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api/client";
import type {
  ConversationSummary,
  ConversationTreeResponse,
  MessageNode,
  NoteCreateResponse,
  UserMessageResponse,
  UUID,
} from "./api/types";
import {
  buildInitialTranscript,
  buildTranscriptFromTree,
  appendUserBlock,
} from "./transcript";
import { ConversationList } from "./components/ConversationList";
import { CreateConversationForm } from "./components/CreateConversationForm";
import { SwitchActivePanel, type SwitchModalData } from "./components/SwitchActivePanel";
import { TreeView } from "./components/TreeView";
import { ThreadView } from "./components/ThreadView";
import { MessageDetailPane } from "./components/MessageDetailPane";
import { Composer } from "./components/Composer";

function findById(tree: ConversationTreeResponse, id: UUID): MessageNode | null {
  return tree.messages.find((m) => m.id === id) ?? null;
}

export default function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<UUID | null>(null);
  const [tree, setTree] = useState<ConversationTreeResponse | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scrollThreadToEndTrigger, setScrollThreadToEndTrigger] = useState(0);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchModalData, setSwitchModalData] = useState<SwitchModalData | null>(null);
  const [noteHostFromTree, setNoteHostFromTree] = useState<UUID | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [cachedTranscript, setCachedTranscript] = useState<string | null>(null);
  /** Static part of transcript header from GET /config/transcript-header (single source of truth). */
  const [transcriptHeaderStatic, setTranscriptHeaderStatic] = useState<string | null>(null);

  // Resizable layout (persisted to localStorage)
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const v = localStorage.getItem("app.leftPanelWidth");
    return v != null ? Math.max(200, Math.min(600, Number(v))) : 320;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const v = localStorage.getItem("app.rightPanelWidth");
    return v != null ? Math.max(280, Math.min(800, Number(v))) : 480;
  });
  const [composerHeight, setComposerHeight] = useState(() => {
    const v = localStorage.getItem("app.composerHeight");
    return v != null ? Math.max(120, Math.min(500, Number(v))) : 200;
  });
  const resizeRef = useRef<{ kind: "left" | "right" | "composer"; start: number; startSize: number } | null>(null);

  useEffect(() => {
    localStorage.setItem("app.leftPanelWidth", String(leftPanelWidth));
  }, [leftPanelWidth]);
  useEffect(() => {
    localStorage.setItem("app.rightPanelWidth", String(rightPanelWidth));
  }, [rightPanelWidth]);
  useEffect(() => {
    localStorage.setItem("app.composerHeight", String(composerHeight));
  }, [composerHeight]);

  const onResizeStart = useCallback((kind: "left" | "right" | "composer", startXOrY: number) => {
    const startSize =
      kind === "left" ? leftPanelWidth : kind === "right" ? rightPanelWidth : composerHeight;
    resizeRef.current = { kind, start: startXOrY, startSize };
  }, [leftPanelWidth, rightPanelWidth, composerHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      if (r.kind === "left") {
        const delta = e.clientX - r.start;
        const newSize = Math.max(200, Math.min(600, r.startSize + delta));
        setLeftPanelWidth(newSize);
        resizeRef.current = { ...r, start: e.clientX, startSize: newSize };
      } else if (r.kind === "right") {
        const delta = r.start - e.clientX;
        const newSize = Math.max(280, Math.min(800, r.startSize + delta));
        setRightPanelWidth(newSize);
        resizeRef.current = { ...r, start: e.clientX, startSize: newSize };
      } else {
        const delta = e.clientY - r.start;
        const newSize = Math.max(120, Math.min(500, r.startSize - delta));
        setComposerHeight(newSize);
        resizeRef.current = { ...r, start: e.clientY, startSize: newSize };
      }
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const setResizingCursor = useCallback((vertical: boolean) => {
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  async function refreshConversations() {
    const items = await api.listConversations();
    setConversations(items);
  }

  async function refreshTree(conversationId: UUID): Promise<ConversationTreeResponse> {
    const t = await api.getTree(conversationId);
    setTree(t);
    setSelectedMessageId((prev) => prev ?? t.active_state.active_message_id);
    return t;
  }

  useEffect(() => {
    refreshConversations().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    api.getTranscriptHeaderStatic().then(
      (r) => setTranscriptHeaderStatic(r.static_part),
      () => { /* use fallback in transcript.ts */ }
    );
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setTree(null);
      setSelectedMessageId(null);
      setCachedTranscript(null);
      return;
    }
    setSwitchModalOpen(false);
    setSwitchModalData(null);
    setNoteHostFromTree(null);
    const id = selectedConversationId;
    refreshTree(id)
      .then((t) => {
        setScrollThreadToEndTrigger((n) => n + 1);
        setCachedTranscript(buildTranscriptFromTree(t, transcriptHeaderStatic));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [selectedConversationId, transcriptHeaderStatic]);

  const activeMessage = useMemo(() => {
    if (!tree) return null;
    return findById(tree, tree.active_state.active_message_id);
  }, [tree]);

  function patchTreeAfterSend(
    prev: ConversationTreeResponse,
    res: UserMessageResponse,
    userContent: string,
    parentMessageId: UUID
  ): ConversationTreeResponse {
    const userNode: MessageNode = {
      id: res.user_message_id,
      parent_id: parentMessageId,
      role: "user",
      author: "end_user",
      content: userContent,
      message_title: null,
      created_at: res.user_created_at,
    };
    const llmNode: MessageNode = {
      id: res.llm_message_id,
      parent_id: res.user_message_id,
      role: "llm",
      author: "stub-echo",
      content: res.llm_content,
      message_title: null,
      created_at: res.llm_created_at,
    };
    return {
      ...prev,
      messages: [...prev.messages, userNode, llmNode],
      active_state: { active_message_id: res.llm_message_id, needs_context_rebuild: false },
    };
  }

  function patchTreeAfterNote(prev: ConversationTreeResponse, note: NoteCreateResponse): ConversationTreeResponse {
    const newNote = {
      id: note.note_id,
      message_id: note.message_id,
      author: note.author,
      content: note.content,
      created_at: note.created_at,
    };
    const existing = prev.notes[note.message_id] ?? [];
    return {
      ...prev,
      notes: { ...prev.notes, [note.message_id]: [...existing, newNote] },
      active_state: { ...prev.active_state, needs_context_rebuild: true },
    };
  }

  function patchTreeActiveState(
    prev: ConversationTreeResponse,
    activeMessageId: UUID,
    needsRebuild: boolean
  ): ConversationTreeResponse {
    return {
      ...prev,
      active_state: { active_message_id: activeMessageId, needs_context_rebuild: needsRebuild },
    };
  }

  function patchTreeMessageTitle(
    prev: ConversationTreeResponse,
    messageId: UUID,
    title: string | null
  ): ConversationTreeResponse {
    return {
      ...prev,
      messages: prev.messages.map((m) => (m.id === messageId ? { ...m, message_title: title } : m)),
    };
  }

  async function onCreateConversation(title: string, firstMessage: string) {
    setError(null);
    setBusy(true);
    try {
      const transcript = buildInitialTranscript(title || null, firstMessage, transcriptHeaderStatic);
      const res = await api.createConversation({
        title: title || undefined,
        message: firstMessage,
        author: "end_user",
        transcript,
      });
      await refreshConversations();
      setSelectedConversationId(res.conversation_id);
    } finally {
      setBusy(false);
    }
  }

  async function onSwitchActive(targetLlmId: UUID, noteHostId: UUID | null, noteContent: string | null) {
    if (!selectedConversationId || !tree) return;
    setError(null);
    setBusy(true);
    try {
      if (noteHostId && noteContent) {
        const noteRes = await api.addNote(selectedConversationId, {
          message_id: noteHostId,
          content: noteContent,
          author: "end_user",
        });
        setTree((prev) => (prev ? patchTreeAfterNote(prev, noteRes) : null));
      }
      await api.setActive(selectedConversationId, { message_id: targetLlmId });
      setTree((prev) => (prev ? patchTreeActiveState(prev, targetLlmId, true) : null));
      setSelectedMessageId(targetLlmId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAddNote(hostMessageId: UUID, content: string) {
    if (!selectedConversationId) return;
    setError(null);
    setBusy(true);
    try {
      const noteRes = await api.addNote(selectedConversationId, {
        message_id: hostMessageId,
        content,
        author: "end_user",
      });
      setTree((prev) => (prev ? patchTreeAfterNote(prev, noteRes) : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSetMessageTitle(messageId: UUID, title: string | null) {
    if (!selectedConversationId) return;
    setError(null);
    setBusy(true);
    try {
      await api.setMessageTitle(selectedConversationId, { message_id: messageId, title });
      setTree((prev) => (prev ? patchTreeMessageTitle(prev, messageId, title) : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSendMessage(text: string) {
    if (!selectedConversationId || !tree) return;
    setError(null);
    setPendingUserMessage(text);
    closeSwitchPanel();
    setScrollThreadToEndTrigger((n) => n + 1);
    setBusy(true);
    try {
      let transcriptToSend: string;
      if (tree.active_state.needs_context_rebuild) {
        const freshTree = await api.getTree(selectedConversationId);
        setTree(freshTree);
        const built = buildTranscriptFromTree(freshTree, transcriptHeaderStatic);
        setCachedTranscript(built);
        transcriptToSend = appendUserBlock(built, text, "end_user");
      } else {
        if (cachedTranscript == null) return;
        transcriptToSend = appendUserBlock(cachedTranscript, text, "end_user");
      }
      const res = await api.postMessage(selectedConversationId, {
        content: text,
        author: "end_user",
        transcript: transcriptToSend,
      });
      setCachedTranscript((prev) => (prev != null ? prev + "\n\n" + res.append_chunk : null));
      const parentId = tree.active_state.active_message_id;
      setTree((prev) => (prev ? patchTreeAfterSend(prev, res, text, parentId) : null));
      setSelectedMessageId(res.llm_message_id);
      setScrollThreadToEndTrigger((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingUserMessage(null);
      setBusy(false);
    }
  }

  const canSend = !!selectedConversationId && !!tree && activeMessage?.role === "llm" && !busy;
  const waitingForLlm = busy && pendingUserMessage != null;

  function closeSwitchPanel() {
    setSwitchModalOpen(false);
    setSwitchModalData(null);
    setNoteHostFromTree(null);
  }

  return (
    <div
      className="app"
      style={{
        gridTemplateColumns: `${leftPanelWidth}px 6px 1fr 6px ${rightPanelWidth}px`,
        gap: 0,
      }}
    >
      <div className="panel" style={{ minWidth: 0 }}>
        <div className="panelHeader">
          <div>Conversations</div>
          <span className="badge">Phase 1</span>
        </div>
        <div className="panelBody" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
          <CreateConversationForm onCreate={onCreateConversation} disabled={waitingForLlm} />
          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "6px 0", flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversationId}
              onSelect={(id) => setSelectedConversationId(id)}
              selectionDisabled={waitingForLlm}
              onDelete={async (id) => {
                try {
                  await api.deleteConversation(id);
                  await refreshConversations();
                  if (selectedConversationId === id) {
                    setSelectedConversationId(null);
                    setTree(null);
                    setSelectedMessageId(null);
                    setCachedTranscript(null);
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
              onPin={async (id, pinned) => {
                try {
                  await api.setConversationPinned(id, pinned);
                  await refreshConversations();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          </div>
          {debugMode ? (
            <>
              <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "6px 0", flexShrink: 0 }} />
              <div style={{ flexShrink: 0, minHeight: 100, maxHeight: 280, overflow: "auto", display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>Transcript (debug — frontend cache)</div>
                <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cachedTranscript ?? "Select a conversation…"}</pre>
              </div>
            </>
          ) : null}
        </div>
        <label className="debugToggle" title="Show full transcript in left panel" style={{ marginTop: 8, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          <span>Debug</span>
        </label>
      </div>

      <div
        className="resizeHandle resizeHandleVertical"
        role="separator"
        aria-label="Resize left panel"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onResizeStart("left", e.clientX);
          setResizingCursor(false);
        }}
      />

      <div className="panel" style={{ minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="panelHeader">
          <div>Thread (root → active)</div>
          <span className="muted">Like any LLM UI</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="panelBody" style={{ padding: 0, flex: 1, minHeight: 200 }}>
            {tree ? (
              <ThreadView
                tree={tree}
                selectedMessageId={selectedMessageId}
                onSelectMessage={(id) => setSelectedMessageId(id)}
                scrollToEndTrigger={scrollThreadToEndTrigger}
                pendingUserMessage={pendingUserMessage}
                waitingForLlm={busy && pendingUserMessage != null}
              />
            ) : (
              <div className="panelBody">
                <div className="muted">Select a conversation to see the thread.</div>
              </div>
            )}
          </div>
          {switchModalOpen && switchModalData && tree ? (
            <div className="panelBody" style={{ borderTop: "1px solid #e2e8f0", flexShrink: 0 }}>
              <SwitchActivePanel
                tree={tree}
                data={switchModalData}
                externalNoteHostId={noteHostFromTree}
                onClose={closeSwitchPanel}
                onSwitchWithoutNote={async () => {
                  await onSwitchActive(switchModalData.targetLlmId, null, null);
                }}
                onSwitchWithNote={async (hostId, note) => {
                  await onSwitchActive(switchModalData.targetLlmId, hostId, note);
                }}
                onHostIdChange={(hostId) =>
                  setSwitchModalData((prev) => (prev ? { ...prev, hostId } : null))
                }
                onNoteChange={(note) =>
                  setSwitchModalData((prev) => (prev ? { ...prev, note, noteContentError: false } : null))
                }
                onSetNoteContentError={(error) =>
                  setSwitchModalData((prev) => (prev ? { ...prev, noteContentError: error } : null))
                }
                onClearNoteHostFromTree={() => setNoteHostFromTree(null)}
              />
            </div>
          ) : null}
          <div
            className="resizeHandle resizeHandleHorizontal"
            role="separator"
            aria-label="Resize composer height"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              onResizeStart("composer", e.clientY);
              setResizingCursor(true);
            }}
          />
          <div
            className="panelBody"
            style={{
              borderTop: "1px solid #e2e8f0",
              flexShrink: 0,
              height: composerHeight,
              minHeight: 120,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div className="panelHeader" style={{ borderBottom: "none", padding: 0, marginBottom: 8, flexShrink: 0 }}>
              <div>Composer</div>
              <span className="badge">Active must be LLM</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <Composer disabled={!canSend} onSend={onSendMessage} />
            </div>
            {!canSend && selectedConversationId ? (
              <div className="muted" style={{ marginTop: 8, flexShrink: 0 }}>
                Sending is enabled only when the backend active node is an <b>LLM</b> message.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="resizeHandle resizeHandleVertical"
        role="separator"
        aria-label="Resize right panel"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onResizeStart("right", e.clientX);
          setResizingCursor(false);
        }}
      />

      <div className="panel" style={{ minWidth: 0 }}>
        <div className="panelHeader">
          <div>Tree & Details</div>
          {busy ? <span className="badge">Working…</span> : null}
        </div>
        <div className="panelBody" style={{ padding: 0, flex: 1, minHeight: 260 }}>
          {tree ? (
            <TreeView
              key={tree.messages.length}
              tree={tree}
              selectedMessageId={selectedMessageId}
              onSelectMessage={(id) => setSelectedMessageId(id)}
              noteHostSelectionMode={switchModalOpen}
              onNoteHostSelect={(id) => setNoteHostFromTree(id)}
            />
          ) : (
            <div className="panelBody">
              <div className="muted">Select a conversation to view its message tree.</div>
            </div>
          )}
        </div>
        <div className="panelBody" style={{ borderTop: "1px solid #e2e8f0", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panelHeader" style={{ borderBottom: "none", padding: 0, marginBottom: 8, flexShrink: 0 }}>
            <div>Details</div>
          </div>
          {error ? <div className="banner" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b", flexShrink: 0 }}>{error}</div> : null}
          <MessageDetailPane
            conversationId={selectedConversationId}
            tree={tree}
            selectedMessageId={selectedMessageId}
            switchActiveDisabled={waitingForLlm}
            onSelectMessage={(id) => setSelectedMessageId(id)}
            onContinueFrom={onSwitchActive}
            onAddNote={onAddNote}
            onSetMessageTitle={onSetMessageTitle}
            addNoteAndTitleDisabled={waitingForLlm}
            onOpenSwitchPanel={(targetLlmId, suggestedHostId) => {
              setSwitchModalOpen(true);
              setSwitchModalData({
                targetLlmId,
                suggestedHostId,
                hostId: suggestedHostId,
                note: "",
                noteContentError: false,
              });
              setNoteHostFromTree(null);
            }}
            onClearNoteHostFromTree={() => setNoteHostFromTree(null)}
          />
        </div>
      </div>
    </div>
  );
}

