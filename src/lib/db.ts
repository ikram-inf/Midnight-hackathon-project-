import Dexie, { type Table } from "dexie";

// ---------------------------------------------------------------------------
// Everything in this file lives in IndexedDB, inside the user's own browser
// profile. Nothing here is ever sent to a server. That's the whole premise:
// - "conversations" = raw chat history, editable/deletable by the user only
// - "profile"       = the lightweight "learning" memory (see llm.ts) built
//                      only from this user's own messages
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id?: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfileFact {
  id?: number;
  fact: string; // a short natural-language fact learned about the user, e.g. "prefers concise answers"
  createdAt: number;
}

class LocalChatDB extends Dexie {
  conversations!: Table<Conversation, string>;
  messages!: Table<ChatMessage, number>;
  profileFacts!: Table<UserProfileFact, number>;

  constructor() {
    super("midnight-private-chat");
    this.version(1).stores({
      conversations: "id, updatedAt",
      messages: "++id, conversationId, createdAt",
      profileFacts: "++id, createdAt",
    });
  }
}

export const db = new LocalChatDB();

// --- Conversations -----------------------------------------------------

export async function createConversation(title = "Nouvelle conversation") {
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.conversations.put(conv);
  return conv;
}

export async function listConversations() {
  return db.conversations.orderBy("updatedAt").reverse().toArray();
}

export async function getMessages(conversationId: string) {
  return db.messages.where("conversationId").equals(conversationId).sortBy("createdAt");
}

export async function addMessage(msg: Omit<ChatMessage, "id" | "createdAt">) {
  const full: ChatMessage = { ...msg, createdAt: Date.now() };
  await db.messages.add(full);
  await db.conversations.update(msg.conversationId, { updatedAt: Date.now() });
  return full;
}

// User cancels / deletes a single conversation whenever they want
export async function deleteConversation(conversationId: string) {
  await db.messages.where("conversationId").equals(conversationId).delete();
  await db.conversations.delete(conversationId);
}

// User wipes EVERYTHING: history + everything the AI has "learned" about them
export async function wipeEverything() {
  await db.messages.clear();
  await db.conversations.clear();
  await db.profileFacts.clear();
}

// --- Learned profile (the "training only for this user" part) ---------

export async function addProfileFact(fact: string) {
  await db.profileFacts.add({ fact, createdAt: Date.now() });
}

export async function listProfileFacts() {
  return db.profileFacts.orderBy("createdAt").toArray();
}

export async function deleteProfileFact(id: number) {
  await db.profileFacts.delete(id);
}
