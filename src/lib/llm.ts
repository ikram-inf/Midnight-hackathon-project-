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

// Small, fast, WebGPU-friendly model. Swap for another id from
// webllm.prebuiltAppConfig.model_list if you want something bigger/smaller.
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let engine: webllm.MLCEngineInterface | null = null;

export async function initEngine(onProgress?: (msg: string) => void) {
  if (engine) return engine;

  engine = await webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (report) => {
      onProgress?.(report.text);
    },
  });

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
  history: { role: "user" | "assistant"; content: string }[]
) {
  const eng = await initEngine();
  const system = await buildSystemPrompt();

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
