import { api } from "./api";

/** Use shared client so `Authorization: Bearer` matches the rest of the app (see `api` interceptors). */

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentChatResponse {
  session_id: string;
  response: string;
  tool_calls: ToolCall[];
  messages: AgentMessage[];
}

export async function sendAgentMessage(
  message: string,
  sessionId: string | null
): Promise<AgentChatResponse> {
  const { data } = await api.post<AgentChatResponse>(
    "/agent/chat",
    { message, session_id: sessionId ?? undefined },
    { timeout: 90_000 }
  );
  return data;
}

export async function clearAgentSession(sessionId: string): Promise<void> {
  await api.delete(`/agent/session/${sessionId}`);
}
