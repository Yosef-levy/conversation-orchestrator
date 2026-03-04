import { useEffect, useRef, useState } from "react";
import type { ConversationSummary, UUID } from "../api/types";

export function ConversationList(props: {
  conversations: ConversationSummary[];
  selectedId: UUID | null;
  onSelect: (id: UUID) => void;
  /** When true, clicking a conversation does nothing (e.g. while waiting for LLM). */
  selectionDisabled?: boolean;
  /** Called when user chooses Delete in the conversation menu. */
  onDelete?: (id: UUID) => void;
  /** Called when user chooses Pin or Unpin. */
  onPin?: (id: UUID, pinned: boolean) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<UUID | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openMenuId === null) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  const pinned = props.conversations.filter((c) => c.pinned);
  const unpinned = props.conversations.filter((c) => !c.pinned);

  function renderItem(c: ConversationSummary) {
    return (
      <div
        key={c.id}
        className={
          "listItem " +
          (props.selectedId === c.id ? "listItemActive" : "") +
          (props.selectionDisabled ? " listItemDisabled" : "")
        }
        style={{ display: "flex", alignItems: "flex-start", gap: 4 }}
      >
        <div
          style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
          onClick={() => !props.selectionDisabled && props.onSelect(c.id)}
          role="button"
          tabIndex={props.selectionDisabled ? -1 : 0}
          title={props.selectionDisabled ? "Wait for the current reply to finish." : undefined}
        >
          <div style={{ fontWeight: 600 }}>{c.title ?? "Untitled"}</div>
          <div className="muted">{new Date(c.updated_at).toLocaleString()}</div>
        </div>
        <div
          ref={openMenuId === c.id ? menuRef : undefined}
          style={{ position: "relative", flexShrink: 0 }}
        >
          <button
            type="button"
            className="conversationMenuTrigger"
            aria-label="Conversation options"
            aria-expanded={openMenuId === c.id}
            onClick={(e) => {
              e.stopPropagation();
              if (props.selectionDisabled) return;
              setOpenMenuId((prev) => (prev === c.id ? null : c.id));
            }}
            disabled={props.selectionDisabled}
          >
            <span aria-hidden>⋮</span>
          </button>
          {openMenuId === c.id ? (
            <div className="conversationMenuDropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="conversationMenuItem"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onPin?.(c.id, !c.pinned);
                  setOpenMenuId(null);
                }}
              >
                {c.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="conversationMenuDelete"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete?.(c.id);
                  setOpenMenuId(null);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="list">
      {props.conversations.length === 0 ? (
        <div className="muted">No conversations yet.</div>
      ) : null}
      {pinned.map(renderItem)}
      {pinned.length > 0 && unpinned.length > 0 ? (
        <hr className="conversationListDivider" />
      ) : null}
      {unpinned.map(renderItem)}
    </div>
  );
}
