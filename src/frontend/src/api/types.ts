export type UUID = string;

export type ConversationSummary = {
  id: UUID;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationCreateRequest = {
  message: string;
  author?: string;
  title?: string;
  transcript: string;
};

export type ActiveState = {
  active_message_id: UUID;
  needs_context_rebuild: boolean;
};

export type MessageNode = {
  id: UUID;
  parent_id: UUID | null;
  role: "user" | "llm";
  author: string;
  content: string;
  message_title: string | null;
  created_at: string;
};

export type NoteItem = {
  id: UUID;
  message_id: UUID;
  author: string;
  content: string;
  created_at: string;
};

export type ConversationTreeResponse = {
  messages: MessageNode[];
  notes: Record<UUID, NoteItem[]>;
  active_state: ActiveState;
  conversation_title?: string | null;
};

export type SetActiveRequest = { message_id: UUID };
export type NoteCreateRequest = { message_id: UUID; content: string; author?: string };
export type UserMessageCreateRequest = { content: string; author?: string; transcript: string };

export type UserMessageResponse = {
  user_message_id: UUID;
  llm_message_id: UUID;
  llm_content: string;
  append_chunk: string;
  user_created_at: string;
  llm_created_at: string;
};

export type NoteCreateResponse = {
  note_id: UUID;
  message_id: UUID;
  author: string;
  content: string;
  created_at: string;
};

