import { useState } from "react";

export function Composer(props: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      await props.onSend(content);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    send();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <textarea
        placeholder="Send a message… (Enter to send, Shift+Enter for new line)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={props.disabled || busy}
        style={{ flex: 1, minHeight: 60, resize: "none" }}
      />
      {error ? <div className="muted" style={{ color: "#b91c1c", flexShrink: 0 }}>{error}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          className="primary"
          onClick={send}
          disabled={props.disabled || busy || !text.trim()}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

