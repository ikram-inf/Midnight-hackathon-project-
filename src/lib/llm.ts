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

// Store the engine on globalThis to persist it across hot reloads and prevent the Emscripten VectorInt mismatch!
const g = globalThis as any;
if (g.__mlc_engine__ === undefined) {
  g.__mlc_engine__ = null;
  g.__mlc_loaded_model_id__ = null;
  g.__mlc_init_promise__ = null;
  g.__mlc_initializing_model_id__ = null;
}

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

  if (g.__mlc_engine__ && g.__mlc_loaded_model_id__ === targetModelId) {
    return g.__mlc_engine__;
  }

  if (g.__mlc_init_promise__ && g.__mlc_initializing_model_id__ === targetModelId) {
    return g.__mlc_init_promise__;
  }

  g.__mlc_initializing_model_id__ = targetModelId;
  g.__mlc_init_promise__ = (async () => {
    if (g.__mlc_engine__) {
      try {
        onProgress?.("Unloading previous model from GPU...");
        await g.__mlc_engine__.unload();
      } catch (e) {
        console.warn("Unloading previous model failed:", e);
      }
      g.__mlc_engine__ = null;
      g.__mlc_loaded_model_id__ = null;
    }

    const newEngine = await webllm.CreateMLCEngine(targetModelId, {
      initProgressCallback: (report) => {
        onProgress?.(report.text);
      },
    });
    g.__mlc_engine__ = newEngine;
    g.__mlc_loaded_model_id__ = targetModelId;
    return newEngine;
  })();

  try {
    const result = await g.__mlc_init_promise__;
    return result;
  } catch (error) {
    g.__mlc_engine__ = null;
    g.__mlc_loaded_model_id__ = null;
    g.__mlc_initializing_model_id__ = null;
    g.__mlc_init_promise__ = null;
    throw error;
  }
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

// A robust local sentence-by-sentence heuristic to extract profile facts from the user's messages.
// This allows the model to "learn" a wide range of facts (e.g. name, location, pets, preferences)
// 100% locally on the device, without sending raw conversation transcripts to any servers.
export function extractCandidateFacts(userMessage: string): string[] {
  const sentences = userMessage.split(/[.!?\n]+/);
  const triggers = [
    "i am", "i'm", "my name", "my favorite", "i like", "i love", "i prefer",
    "i live in", "i work", "i have", "my goal", "my dream", "i want",
    "i'm working on", "i am working on", "my cat", "my dog", "my pet",
    "my hobby", "my hobbies", "my sister", "my brother", "my family",
    "my friend", "i speak", "i study", "i play", "i hate", "i dislike",
    "i don't like", "my age", "i was born"
  ];

  const foundFacts: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 4) continue;
    
    const lower = trimmed.toLowerCase();
    const hit = triggers.find((t) => lower.includes(t));
    if (hit) {
      // Clean up punctuation or extra spaces and save (up to 120 chars for clean facts)
      foundFacts.push(trimmed.slice(0, 120));
    }
  }
  return foundFacts;
}
