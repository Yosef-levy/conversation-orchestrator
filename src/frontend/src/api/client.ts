import type {
  ConversationCreateRequest,
  ConversationSummary,
  ConversationTreeResponse,
  NoteCreateRequest,
  NoteCreateResponse,
  SetActiveRequest,
  UserMessageCreateRequest,
  UserMessageResponse,
  UUID,
} from "./types";

function getBaseUrl(): string {
  // Default to same-origin + Vite dev proxy. Override with VITE_API_BASE when needed.
  return (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    if (res.status >= 500 && text.startsWith("{")) {
      try {
        const body = JSON.parse(text) as { detail?: string; traceback?: string; type?: string };
        detail = [body.detail, body.type, body.traceback].filter(Boolean).join("\n\n");
      } catch {
        /* use raw text */
      }
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as T;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBaseUrl();
  const primaryUrl = `${base}${path}`;

  try {
    return await fetchJson<T>(primaryUrl, init);
  } catch (e) {
    // If a direct base URL is configured but not reachable from the browser
    // (common with containers), fall back to same-origin (Vite proxy) for dev.
    const isNetworkError =
      e instanceof TypeError && /fetch/i.test(e.message || "fetch");
    if (base && isNetworkError) {
      try {
        return await fetchJson<T>(path, init);
      } catch {
        // fall through and rethrow original error below
      }
    }
    if (e instanceof Error) {
      throw new Error(`${e.message}\n\nRequest URL: ${primaryUrl}`);
    }
    throw e;
  }
}

export const api = {
  listConversations(): Promise<ConversationSummary[]> {
    return http<ConversationSummary[]>("/conversations");
  },

  createConversation(body: ConversationCreateRequest): Promise<{ conversation_id: UUID }> {
    return http<{ conversation_id: UUID }>("/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getTree(conversationId: UUID): Promise<ConversationTreeResponse> {
    return http<ConversationTreeResponse>(`/conversations/${conversationId}/tree`);
  },

  setActive(conversationId: UUID, body: SetActiveRequest): Promise<{ status: string }> {
    return http<{ status: string }>(`/conversations/${conversationId}/active`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  addNote(conversationId: UUID, body: NoteCreateRequest): Promise<NoteCreateResponse> {
    return http<NoteCreateResponse>(`/conversations/${conversationId}/notes`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  postMessage(conversationId: UUID, body: UserMessageCreateRequest): Promise<UserMessageResponse> {
    return http<UserMessageResponse>(`/conversations/${conversationId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  setMessageTitle(
    conversationId: UUID,
    body: { message_id: UUID; title: string | null }
  ): Promise<{ status: string }> {
    return http<{ status: string }>(`/conversations/${conversationId}/message-title`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getTranscript(conversationId: UUID): Promise<{ transcript: string }> {
    return http<{ transcript: string }>(`/conversations/${conversationId}/transcript`);
  },

  getTranscriptHeaderStatic(): Promise<{ static_part: string }> {
    return http<{ static_part: string }>("/config/transcript-header");
  },

  deleteConversation(conversationId: UUID): Promise<{ status: string }> {
    return http<{ status: string }>(`/conversations/${conversationId}`, {
      method: "DELETE",
    });
  },

  setConversationPinned(conversationId: UUID, pinned: boolean): Promise<{ status: string }> {
    return http<{ status: string }>(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    });
  },
};

