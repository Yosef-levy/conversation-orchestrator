import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationTreeResponse, MessageNode, NoteItem, UUID } from "../api/types";
import { Modal } from "./Modal";
import { buildParentMap, lca, computeDepths } from "./treeLayout";

function byId(tree: ConversationTreeResponse): Map<UUID, MessageNode> {
  return new Map(tree.messages.map((m) => [m.id, m]));
}

function childrenOf(tree: ConversationTreeResponse): Map<UUID, MessageNode[]> {
  const map = new Map<UUID, MessageNode[]>();
  for (const m of tree.messages) {
    if (m.parent_id) {
      const arr = map.get(m.parent_id) ?? [];
      arr.push(m);
      map.set(m.parent_id, arr);
    }
  }
  for (const arr of map.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return map;
}

function contentSnippet(content: string, maxLen = 56): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine || "(empty)";
  return oneLine.slice(0, maxLen) + "…";
}

function formatMessageLabel(m: MessageNode, depth: number): string {
  const ckpt = (m as unknown as { checkpoint_name?: string | null }).checkpoint_name
    ? ` [${(m as unknown as { checkpoint_name?: string | null }).checkpoint_name}]`
    : "";
  const titleOrContent = m.message_title?.trim()
    ? m.message_title
    : contentSnippet(m.content);
  return `${"  ".repeat(depth)}${m.role.toUpperCase()}${ckpt} — ${titleOrContent} (${m.id.slice(0, 8)})`;
}

export function MessageDetailPane(props: {
  conversationId: UUID | null;
  tree: ConversationTreeResponse | null;
  selectedMessageId: UUID | null;
  /** When true, "Continue from here" is disabled (e.g. while waiting for LLM reply). */
  switchActiveDisabled?: boolean;
  /** When true, "Add NOTE" and "Add message title" are disabled. */
  addNoteAndTitleDisabled?: boolean;
  onSelectMessage: (id: UUID) => void;
  onContinueFrom: (targetLlmId: UUID, noteHostId: UUID | null, noteContent: string | null) => Promise<void>;
  onAddNote: (hostMessageId: UUID, content: string) => Promise<void>;
  onSetMessageTitle: (messageId: UUID, title: string | null) => Promise<void>;
  onOpenSwitchPanel?: (targetLlmId: UUID, suggestedHostId: UUID | null) => void;
  onClearNoteHostFromTree?: () => void;
}) {
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (titleModalOpen) {
      const t = setTimeout(() => titleInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [titleModalOpen]);

  const computed = useMemo(() => {
    if (!props.tree) return null;
    const mById = byId(props.tree);
    const childMap = childrenOf(props.tree);
    const parentMap = buildParentMap(props.tree.messages);
    const depths = computeDepths(props.tree.messages);
    return { mById, childMap, parentMap, depths };
  }, [props.tree]);

  if (!props.tree || !computed) {
    return <div className="muted">Select a conversation to see details.</div>;
  }

  const selected = props.selectedMessageId ? computed.mById.get(props.selectedMessageId) : null;
  const selectedNotes: NoteItem[] = selected ? props.tree.notes[selected.id] ?? [] : [];
  const activeId = props.tree.active_state.active_message_id;

  const showPendingRebuild = props.tree.active_state.needs_context_rebuild;

  const nearestNextLlm = (() => {
    if (!selected) return null;
    if (selected.role !== "user") return null;
    const kids = computed.childMap.get(selected.id) ?? [];
    return kids.find((k) => k.role === "llm") ?? null;
  })();

  const canContinue = selected?.role === "llm" && !props.switchActiveDisabled;

  function openSwitchModal(targetLlmId: UUID) {
    const suggested = lca(computed.parentMap, activeId, targetLlmId);
    props.onOpenSwitchPanel?.(targetLlmId, suggested);
  }

  return (
    <div className="detailPane">
      <div className="detailPaneScroll">
        {showPendingRebuild ? (
        <div className="banner">
          Context rebuild is pending (from a switch or NOTE). No rebuild happens until you send the next message.
        </div>
      ) : null}

      {selected ? (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700 }}>Selected</div>
            <span className="badge">{selected.role.toUpperCase()}</span>
          </div>

          {selected.message_title?.trim() ? (
            <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{selected.message_title}</div>
          ) : null}
          <div className="muted">{selected.id}</div>
          <div className="detailPaneMessageContent">{selected.content}</div>

          {selected.role === "user" ? (
            <div className="banner" style={{ borderColor: "#cbd5e1", background: "#f8fafc", color: "#334155" }}>
              “Continue from here” is only allowed from an <b>LLM</b> node. Please select the nearest assistant reply.
              {nearestNextLlm ? (
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => props.onSelectMessage(nearestNextLlm.id)}>
                    Select next assistant reply
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="muted">Click a node in the tree to see details.</div>
      )}
      </div>

      {selected ? (
        <div className="detailPaneFooter">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <button
                className="primary"
                disabled={!canContinue}
                onClick={() => selected && openSwitchModal(selected.id)}
                title={
                  props.switchActiveDisabled
                    ? "Wait for the current reply to finish before switching."
                    : !canContinue
                      ? "Select an LLM node to continue."
                      : "Switch active node (optional NOTE prompt)."
                }
              >
                Continue from here
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                onClick={() => setNoteModalOpen(true)}
                disabled={!selected || props.addNoteAndTitleDisabled}
                title={props.addNoteAndTitleDisabled ? "Wait for the current reply to finish." : undefined}
              >
                Add NOTE
              </button>
              <button
                onClick={() => {
                  if (selected) {
                    setTitleValue(selected.message_title ?? "");
                    setTitleModalOpen(true);
                  }
                }}
                disabled={!selected || props.addNoteAndTitleDisabled}
                title={props.addNoteAndTitleDisabled ? "Wait for the current reply to finish." : undefined}
              >
                Add message title
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>NOTES (attached)</div>
              <span className="badge">{selectedNotes.length}</span>
            </div>
            {selectedNotes.length === 0 ? (
              <div className="muted">No notes attached to this message.</div>
            ) : (
              <div className="list">
                {selectedNotes
                  .slice()
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((n) => (
                    <div key={n.id} className="listItem" style={{ cursor: "default" }}>
                      <div style={{ fontWeight: 600 }}>{n.author}</div>
                      <div className="muted">{new Date(n.created_at).toLocaleString()}</div>
                      <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{n.content}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {titleModalOpen && selected ? (
        (() => {
          async function saveTitle() {
            const title = titleValue.trim() || null;
            await props.onSetMessageTitle(selected.id, title);
            setTitleModalOpen(false);
            setTitleValue("");
          }
          return (
            <Modal
              title="Message title"
              onClose={() => { setTitleModalOpen(false); setTitleValue(""); }}
              footer={
                <>
                  <button onClick={() => { setTitleModalOpen(false); setTitleValue(""); }}>
                    Cancel
                  </button>
                  <button className="primary" onClick={saveTitle}>
                    Save
                  </button>
                </>
              }
            >
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  }
                }}
                placeholder="Short title for this message (optional)"
              />
            </Modal>
          );
        })()
      ) : null}

      {noteModalOpen && selected ? (
        <Modal
          title="Add NOTE (metadata, not a message)"
          onClose={() => {
            setNoteModalOpen(false);
            setNoteText("");
          }}
          footer={
            <>
              <button
                onClick={() => {
                  setNoteModalOpen(false);
                  setNoteText("");
                }}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={!noteText.trim()}
                onClick={async () => {
                  const text = noteText.trim();
                  if (!text) return;
                  await props.onAddNote(selected.id, text);
                  setNoteModalOpen(false);
                  setNoteText("");
                }}
              >
                Add NOTE
              </button>
            </>
          }
        >
          <div className="muted">
            NOTES attach to a host message and are rendered inline in transcript after that host message. They are not tree nodes.
          </div>
          <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a NOTE…" />
        </Modal>
      ) : null}

    </div>
  );
}

