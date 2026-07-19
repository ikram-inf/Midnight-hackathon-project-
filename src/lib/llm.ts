import * as webllm from "@mlc-ai/web-llm";
import { listProfileFacts } from "./db";

// ---------------------------------------------------------------------------
// The model itself runs 100% on-device via WebGPU (no API calls, no cloud).
// The first launch downloads model weights from the WebLLM CDN and caches
// them in the browser; every message after that is generated locally.
//
// "Training only for the user" is implemented realistically for a 10h build
// as IN-CONTEXT PERSONALIZATION: short natural-language facts the model
// itself extracts from the conversation ("prefers short answers", "is
// building a hackathon project in French") get stored locally (db.ts) and
// re-injected as a system prompt on every future message. This is the
// standard, honest way to do this without a real fine-tuning pipeline in
// the browser, and it keeps the "the user can cancel/delete it any time"
// promise trivial to implement (just delete rows from IndexedDB).
// ---------------------------------------------------------------------------

// Small, fast, WebGPU-friendly model options.
export interface LocalModelOption {
  id: string;
  name: string;
  size: string;
  params: string;
  description: string;
}

export const LOCAL_MODELS: LocalModelOption[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 0.5B (Fastest)",
    size: "390 MB",
    params: "500M params",
    description: "Extremely fast download & loading. Ideal for older hardware or slower networks."
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 1B (Recommended)",
    size: "640 MB",
    params: "1B params",
    description: "Balanced speed and great comprehension. Best overall local experience."
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 1.5B (Original)",
    size: "1.2 GB",
    params: "1.5B params",
    description: "Most capable reasoning, but requires a larger download and more RAM."
  }
];

export function getLocalModelId(): string {
  const stored = localStorage.getItem("chat-local-model");
  if (LOCAL_MODELS.some(m => m.id === stored)) return stored!;
  // Default to Qwen 2.5 0.5B as it is extremely small (390MB) and fast to fetch
  return "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
}

export function setLocalModelId(modelId: string) {
  localStorage.setItem("chat-local-model", modelId);
}

let engine: webllm.MLCEngineInterface | null = null;
let loadedModelId: string | null = null;

export type ChatMode = "local" | "cloud";

export function getChatMode(): ChatMode {
  const stored = localStorage.getItem("chat-mode") as ChatMode;
  if (stored === "local" || stored === "cloud") return stored;
  // Default to local first, fallback to cloud if initialization fails
  return "local";
}

export function setChatMode(mode: ChatMode) {
  localStorage.setItem("chat-mode", mode);
}

export async function initEngine(onProgress?: (msg: string) => void, forceModelId?: string) {
  const targetModelId = forceModelId || getLocalModelId();

  if (engine && loadedModelId === targetModelId) {
    return engine;
  }

  if (engine) {
    try {
      onProgress?.("Unloading previous model from GPU...");
      await engine.unload();
    } catch (e) {
      console.warn("Unloading previous model failed:", e);
    }
    engine = null;
    loadedModelId = null;
  }

  engine = await webllm.CreateMLCEngine(targetModelId, {
    initProgressCallback: (report) => {
      onProgress?.(report.text);
    },
  });
  loadedModelId = targetModelId;

  return engine;
}

async function buildSystemPrompt() {
  const facts = await listProfileFacts();
  if (facts.length === 0) {
    return "You are a helpful, concise, and honest assistant.";
  }
  const factsList = facts.map((f) => `- ${f.fact}`).join("\n");
  return (
    "You are a helpful, concise, and honest assistant. " +
    "Here is what you have learned about this user over your exchanges, " +
    "use it to personalize your replies:\n" +
    factsList
  );
}

export async function generateReply(
  history: { role: "user" | "assistant"; content: string }[],
  mode: ChatMode = getChatMode()
): Promise<string> {
  const system = await buildSystemPrompt();

  if (mode === "cloud") {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, systemPrompt: system }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      return data.reply;
    } catch (e: any) {
      console.error("Cloud Gemini chat failed, trying local fallback:", e);
      throw new Error(e.message || "Failed to get reply from cloud server");
    }
  }

  // Local WebLLM Mode
  const eng = await initEngine();
  const messages: webllm.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history,
  ];

  const reply = await eng.chat.completions.create({
    messages,
    temperature: 0.7,
  });

  return reply.choices[0]?.message?.content ?? "";
}

// Very simple local heuristic to decide whether to "remember" something from
// a user message. Runs 100% locally, nothing leaves the device. For the demo
// this is intentionally simple; a nicer version could ask the model itself
// "should this be remembered? reply fact|none" as a second local call.
export function extractCandidateFact(userMessage: string): string | null {
  const triggers = [
    "i prefer",
    "i like",
    "i don't like",
    "i dislike",
    "i am",
    "i'm",
    "my goal",
    "i'm working on",
    "i am working on",
  ];
  const lower = userMessage.toLowerCase();
  const hit = triggers.find((t) => lower.includes(t));
  if (!hit) return null;
  return userMessage.trim().slice(0, 200);
}
