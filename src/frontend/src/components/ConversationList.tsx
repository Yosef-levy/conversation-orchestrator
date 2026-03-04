import type { ConversationSummary, UUID } from "../api/types";

export function ConversationList(props: {
  conversations: ConversationSummary[];
  selectedId: UUID | null;
  onSelect: (id: UUID) => void;
  /** When true, clicking a conversation does nothing (e.g. while waiting for LLM). */
  selectionDisabled?: boolean;
}) {
  return (
    <div className="list">
      {props.conversations.length === 0 ? (
        <div className="muted">No conversations yet.</div>
      ) : null}
      {props.conversations.map((c) => (
        <div
          key={c.id}
          className={
            "listItem " + (props.selectedId === c.id ? "listItemActive" : "") + (props.selectionDisabled ? " listItemDisabled" : "")
          }
          onClick={() => !props.selectionDisabled && props.onSelect(c.id)}
          role="button"
          tabIndex={props.selectionDisabled ? -1 : 0}
          title={props.selectionDisabled ? "Wait for the current reply to finish." : undefined}
        >
          <div style={{ fontWeight: 600 }}>{c.title ?? "Untitled"}</div>
          <div className="muted">{new Date(c.updated_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

