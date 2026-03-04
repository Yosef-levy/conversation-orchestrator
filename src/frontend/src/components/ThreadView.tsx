import { useEffect, useRef } from "react";
import type { ConversationTreeResponse, MessageNode, NoteItem, UUID } from "../api/types";
import { pathFromRoot } from "./treeLayout";

export function ThreadView(props: {
  tree: ConversationTreeResponse;
  selectedMessageId: UUID | null;
  onSelectMessage: (id: UUID) => void;
  scrollToEndTrigger?: number;
  pendingUserMessage?: string | null;
  waitingForLlm?: boolean;
}) {
  const { tree, selectedMessageId, onSelectMessage, scrollToEndTrigger, pendingUserMessage, waitingForLlm } = props;
  const path = pathFromRoot(tree.messages, tree.active_state.active_message_id);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToEndTrigger == null || scrollToEndTrigger === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const scroll = () => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  }, [scrollToEndTrigger, path.length, pendingUserMessage, waitingForLlm]);

  const hasContent = path.length > 0 || pendingUserMessage;

  if (!hasContent) {
    return (
      <div className="muted" style={{ padding: 12 }}>
        No messages on active path.
      </div>
    );
  }

  const messageCount = path.length + (pendingUserMessage ? 1 : 0) + (waitingForLlm ? 1 : 0);

  return (
    <div className="threadView">
      <div className="threadViewHeader muted">
        Root → active ({messageCount} message{messageCount === 1 ? "" : "s"})
      </div>
      <div className="threadScroll" ref={scrollRef}>
        {path.map((msg) => (
          <ThreadMessageBlock
            key={msg.id}
            message={msg}
            notes={tree.notes[msg.id] ?? []}
            isActive={msg.id === tree.active_state.active_message_id && !pendingUserMessage}
            isSelected={msg.id === selectedMessageId}
            onSelect={() => onSelectMessage(msg.id)}
          />
        ))}
        {pendingUserMessage ? (
          <div className="threadBlock user authorUser threadBlockPending">
            <div className="threadBlockHeader">
              <span className="badge">USER</span>
            </div>
            <div className="threadBlockContent">{pendingUserMessage}</div>
          </div>
        ) : null}
        {waitingForLlm ? (
          <div className="threadBlock llm authorOther threadBlockWaiting">
            <div className="threadBlockHeader">
              <span className="badge">LLM</span>
              <span className="badge">Waiting for reply…</span>
            </div>
            <div className="threadBlockContent threadBlockWaitingDots">
              <span className="dot">.</span>
              <span className="dot">.</span>
              <span className="dot">.</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function isAgentOrTool(author: string): boolean {
  const a = author.toLowerCase();
  return a.includes("agent") || a.includes("tool") || a.startsWith("tool:");
}

function isEndUser(author: string): boolean {
  const a = author.toLowerCase();
  return a === "end_user" || a === "user";
}

function ThreadMessageBlock(props: {
  message: MessageNode;
  notes: NoteItem[];
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { message, notes, isActive, isSelected, onSelect } = props;
  const role = message.role.toUpperCase();
  const authorClass =
    isAgentOrTool(message.author) ? "authorAgentTool" : isEndUser(message.author) ? "authorUser" : "authorOther";

  return (
    <div
      className={`threadBlock ${message.role} ${authorClass} ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="threadBlockHeader">
        <span className="badge">{role}</span>
        {notes.length > 0 ? (
          <span className="badge noteIndicator" title="NOTES attached (metadata, not message nodes)">
            NOTE{notes.length === 1 ? "" : "S"} ({notes.length})
          </span>
        ) : null}
        {isActive ? <span className="badge">ACTIVE</span> : null}
      </div>
      <div className="threadBlockContent">{message.content}</div>
      {notes.length > 0 ? (
        <div className="threadBlockNotes">
          {notes
            .slice()
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((n) => (
              <div key={n.id} className="threadNote">
                <div className="muted" style={{ fontSize: 11 }}>
                  {n.author} · {new Date(n.created_at).toLocaleString()}
                </div>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{n.content}</div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
