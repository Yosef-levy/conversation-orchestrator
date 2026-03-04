import { useState } from "react";

export function CreateConversationForm(props: {
  onCreate: (title: string, firstMessage: string) => Promise<void>;
  /** When true, form is disabled (e.g. while waiting for LLM in current conversation). */
  disabled?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formDisabled = props.disabled || busy;

  async function submit() {
    setError(null);
    const msg = message.trim();
    if (!msg) {
      setError("Please enter a first message.");
      return;
    }
    setBusy(true);
    try {
      await props.onCreate(title.trim(), msg);
      setTitle("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={formDisabled}
      />
      <textarea
        placeholder="Start a new conversation…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={formDisabled}
      />
      {error ? <div className="muted" style={{ color: "#b91c1c" }}>{error}</div> : null}
      <button
        className="primary"
        onClick={submit}
        disabled={formDisabled}
        title={props.disabled ? "Wait for the current reply to finish." : undefined}
      >
        {busy ? "Creating…" : "Create conversation"}
      </button>
    </div>
  );
}

