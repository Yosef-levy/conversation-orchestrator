import { useMemo } from "react";
import type { ConversationTreeResponse, MessageNode, UUID } from "../api/types";
import { computeDepths } from "./treeLayout";

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

export type SwitchModalData = {
  targetLlmId: UUID;
  suggestedHostId: UUID | null;
  hostId: UUID | null;
  note: string;
  noteContentError: boolean;
};

export function SwitchActivePanel(props: {
  tree: ConversationTreeResponse;
  data: SwitchModalData;
  externalNoteHostId: UUID | null;
  onClose: () => void;
  onSwitchWithoutNote: () => Promise<void>;
  onSwitchWithNote: (hostId: UUID, note: string) => Promise<void>;
  onHostIdChange: (hostId: UUID | null) => void;
  onNoteChange: (note: string) => void;
  onSetNoteContentError: (error: boolean) => void;
  onClearNoteHostFromTree: () => void;
}) {
  const { data, externalNoteHostId } = props;
  const effectiveHostId = externalNoteHostId ?? data.hostId;

  const { sortedMessages, depths } = useMemo(() => {
    const depths = computeDepths(props.tree.messages);
    const sorted = [...props.tree.messages].sort((a, b) => {
      const da = depths.get(a.id) ?? 0;
      const db = depths.get(b.id) ?? 0;
      if (da !== db) return da - db;
      return a.created_at.localeCompare(b.created_at);
    });
    return { sortedMessages: sorted, depths };
  }, [props.tree.messages]);

  return (
    <div className="switchPanel">
      <div className="switchPanelHeader">Switch active node (optional NOTE)</div>
      <div className="switchPanelBody">
        <div className="muted">
          Phase 1 semantics: switching sets <b>needs_context_rebuild</b>=true in the backend, but no transcript rebuild and no LLM call happen now.
          Rebuild happens only when you send the next message via <code>POST /message</code>.
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>NOTE host message</div>
          <select
            value={effectiveHostId ?? ""}
            onChange={(e) => {
              props.onHostIdChange(e.target.value || null);
              props.onClearNoteHostFromTree();
            }}
          >
            <option value="">(select host message)</option>
            {sortedMessages.map((m) => {
              const d = depths.get(m.id) ?? 0;
              const label = formatMessageLabel(m, d);
              const isSuggested = m.id === data.suggestedHostId;
              const fromTree = m.id === externalNoteHostId;
              return (
                <option key={m.id} value={m.id}>
                  {fromTree ? `${label} (from tree)` : isSuggested ? `${label} (suggested LCA)` : label}
                </option>
              );
            })}
          </select>
          <div className="muted" style={{ marginTop: 6 }}>
            Or click a node in the tree (right) to choose the NOTE host.
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>NOTE content</div>
          <textarea
            className={data.noteContentError ? "inputError" : ""}
            value={data.note}
            onChange={(e) => {
              props.onNoteChange(e.target.value);
              props.onSetNoteContentError(false);
            }}
            placeholder="Write a NOTE to carry state across branches…"
          />
        </div>
      </div>
      <div className="switchPanelFooter">
        <button onClick={props.onClose}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={async () => {
            await props.onSwitchWithoutNote();
            props.onClose();
          }}
        >
          Switch without NOTE
        </button>
        <button
          className="primary"
          onClick={async () => {
            if (!data.note.trim()) {
              props.onSetNoteContentError(true);
              return;
            }
            if (!effectiveHostId) return;
            await props.onSwitchWithNote(effectiveHostId, data.note.trim());
            props.onClose();
          }}
        >
          Switch + add NOTE
        </button>
      </div>
    </div>
  );
}
