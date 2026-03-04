import type { ConversationTreeResponse, MessageNode, NoteItem, UUID } from "./api/types";
import { pathFromRoot } from "./components/treeLayout";

const WRAPPER_USER_START = "<<<USER>>>";
const WRAPPER_USER_END = "<<<END USER>>>";
const WRAPPER_LLM_START = "<<<LLM>>>";
const WRAPPER_LLM_END = "<<<END LLM>>>";
const WRAPPER_NOTE_START = "<<<NOTE>>>";
const WRAPPER_NOTE_END = "<<<END NOTE>>>";

function escapeWrappers(text: string): string {
  return text
    .replace(/<<<USER>>>/g, "<< <USER>>")
    .replace(/<<<END USER>>>/g, "<< <END USER>>")
    .replace(/<<<LLM>>>/g, "<< <LLM>>")
    .replace(/<<<END LLM>>>/g, "<< <END LLM>>")
    .replace(/<<<NOTE>>>/g, "<< <NOTE>>")
    .replace(/<<<END NOTE>>>/g, "<< <END NOTE>>");
}

function buildHeader(conversationTitle: string | null): string {
  const title = conversationTitle?.trim() || "Conversation";
  return [
    title,
    "",
    "You are given a structured conversation transcript.",
    "",
    "The transcript consists of:",
    "- <<<USER>>> blocks (user messages)",
    "- <<<LLM>>> blocks (assistant responses)",
    "- <<<NOTE>>> blocks (user-authored state notes)",
    "",
    "NOTES are contextual clarifications or decisions and must be treated as part of the conversation state.",
    "",
    "Continue the conversation by responding as the LLM.",
    "Do not reproduce wrapper tags in your response.",
    "",
  ].join("\n");
}

function serializeMessageBlock(message: MessageNode, notes: NoteItem[]): string {
  const start = message.role === "user" ? WRAPPER_USER_START : WRAPPER_LLM_START;
  const end = message.role === "user" ? WRAPPER_USER_END : WRAPPER_LLM_END;
  const parts: string[] = [start, escapeWrappers(message.content), end, ""];
  const sortedNotes = [...notes].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
  for (const note of sortedNotes) {
    parts.push(WRAPPER_NOTE_START, escapeWrappers(note.content), WRAPPER_NOTE_END, "");
  }
  return parts.join("\n").replace(/\n+$/, "");
}

/**
 * Build full transcript for root→active path from tree (messages + notes).
 * Used when loading a conversation or when needs_context_rebuild (refetch tree then build).
 */
export function buildTranscriptFromTree(tree: ConversationTreeResponse): string {
  const path = pathFromRoot(tree.messages, tree.active_state.active_message_id);
  const title = tree.conversation_title ?? null;
  const header = buildHeader(title);
  const blocks: string[] = [header];
  for (const msg of path) {
    const notes = tree.notes[msg.id] ?? [];
    blocks.push(serializeMessageBlock(msg, notes));
  }
  return blocks.join("\n\n").trim() + "\n";
}

/**
 * Build initial transcript for create conversation: header + first user block.
 */
export function buildInitialTranscript(
  conversationTitle: string | null,
  firstMessageContent: string
): string {
  const header = buildHeader(conversationTitle);
  const userBlock = [
    WRAPPER_USER_START,
    escapeWrappers(firstMessageContent),
    WRAPPER_USER_END,
  ].join("\n");
  return header + "\n\n" + userBlock + "\n";
}

/**
 * Append a new user message block to the transcript (for send).
 */
export function appendUserBlock(transcript: string, content: string, _author?: string): string {
  const block = [WRAPPER_USER_START, escapeWrappers(content), WRAPPER_USER_END].join("\n");
  return transcript.trimEnd() + "\n\n" + block + "\n";
}
