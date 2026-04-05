import axios from "axios";

// Use the same proxy base as the rest of the app ("/api" proxied to FastAPI)
const http = axios.create({ baseURL: "/api", timeout: 60_000 }); // 60s for LLM

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
  const { data } = await http.post<AgentChatResponse>("/agent/chat", {
    message,
    session_id: sessionId ?? undefined,
  });
  return data;
}

export async function clearAgentSession(sessionId: string): Promise<void> {
  await http.delete(`/agent/session/${sessionId}`);
}
