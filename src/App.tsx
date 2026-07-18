import { useEffect, useRef, useState } from "react";
import {
  type Conversation,
  type ChatMessage,
  type UserProfileFact,
  createConversation,
  listConversations,
  getMessages,
  addMessage,
  deleteConversation,
  wipeEverything,
  addProfileFact,
  listProfileFacts,
  deleteProfileFact,
} from "./lib/db";
import { generateReply, extractCandidateFact, initEngine } from "./lib/llm";
import { createConsentCommitment, type ConsentAction } from "./lib/midnight";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [facts, setFacts] = useState<UserProfileFact[]>([]);
  const [input, setInput] = useState("");
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelStatus, setModelStatus] = useState("Initializing local model…");
  const [sending, setSending] = useState(false);
  const [lastCommitment, setLastCommitment] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const convs = await listConversations();
      setConversations(convs);
      if (convs.length > 0) setActiveId(convs[0].id);
      setFacts(await listProfileFacts());

      try {
        await initEngine((msg) => setModelStatus(msg));
        setLoadingModel(false);
      } catch (e) {
        setModelStatus(
          "WebGPU is not available on this browser/device. Try an up-to-date Chrome."
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    getMessages(activeId).then(setMessages);
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleNewConversation() {
    const conv = await createConversation();
    setConversations(await listConversations());
    setActiveId(conv.id);
  }

  async function handleDeleteConversation(id: string) {
    await deleteConversation(id);
    const convs = await listConversations();
    setConversations(convs);
    if (activeId === id) setActiveId(convs[0]?.id ?? null);
  }

  async function handleWipe() {
    if (!confirm("Delete ALL history and everything the AI has learned? This cannot be undone.")) return;
    await wipeEverything();
    setConversations([]);
    setMessages([]);
    setFacts([]);
    setActiveId(null);
    await recordConsentEvent("data_wiped");
  }

  async function recordConsentEvent(action: ConsentAction) {
    const c = await createConsentCommitment(action);
    setLastCommitment(c.commitment);
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    let convId = activeId;
    if (!convId) {
      const conv = await createConversation();
      setConversations(await listConversations());
      convId = conv.id;
      setActiveId(convId);
    }

    const userText = input;
    setInput("");
    setSending(true);

    const userMsg = await addMessage({ conversationId: convId, role: "user", content: userText });
    setMessages((m) => [...m, userMsg]);

    // Local-only "learning": look for a fact worth remembering, store it,
    // and let the user see/delete it immediately.
    const candidate = extractCandidateFact(userText);
    if (candidate) {
      await addProfileFact(candidate);
      setFacts(await listProfileFacts());
    }

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const replyText = await generateReply(history);
    const assistantMsg = await addMessage({
      conversationId: convId,
      role: "assistant",
      content: replyText,
    });
    setMessages((m) => [...m, assistantMsg]);
    setConversations(await listConversations());
    setSending(false);
  }

  async function handleDeleteFact(id?: number) {
    if (id === undefined) return;
    await deleteProfileFact(id);
    setFacts(await listProfileFacts());
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◐</span>
          <span className="brand-name">private chat</span>
        </div>

        <button className="btn-new" onClick={handleNewConversation}>
          + New conversation
        </button>

        <div className="conv-list">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={"conv-item" + (c.id === activeId ? " active" : "")}
              onClick={() => setActiveId(c.id)}
            >
              <span className="conv-title">{c.title}</span>
              <button
                className="conv-delete"
                title="Delete this conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(c.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="profile-panel">
          <div className="profile-header">What the AI has learned about you</div>
          {facts.length === 0 && <div className="profile-empty">Nothing yet.</div>}
          {facts.map((f) => (
            <div key={f.id} className="fact-item">
              <span>{f.fact}</span>
              <button onClick={() => handleDeleteFact(f.id)} title="Forget this fact">
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="consent-panel">
          <button className="btn-ghost" onClick={() => recordConsentEvent("consent_given")}>
            Prove my consent
          </button>
          <button className="btn-ghost" onClick={() => recordConsentEvent("consent_revoked")}>
            Revoke
          </button>
          <button className="btn-danger" onClick={handleWipe}>
            Erase everything
          </button>
          {lastCommitment && (
            <div className="commitment">
              <div className="commitment-label">On-chain proof (hash only)</div>
              <code>{lastCommitment.slice(0, 24)}…</code>
            </div>
          )}
        </div>

        <div className="privacy-badge">
          <span className="dot" /> 100% local · no data ever sent
        </div>
      </aside>

      <main className="chat">
        {loadingModel && (
          <div className="model-loading">
            <div className="spinner" />
            <p>{modelStatus}</p>
            <p className="model-loading-sub">
              The model downloads once and stays cached in your browser.
              Every reply after that is generated locally, with no network calls.
            </p>
          </div>
        )}

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && !loadingModel && (
            <div className="empty-state">
              Write a first message. Nothing ever leaves your device.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={"message " + m.role}>
              <div className="message-role">{m.role === "user" ? "you" : "assistant"}</div>
              <div className="message-content">{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="message assistant">
              <div className="message-role">assistant</div>
              <div className="message-content typing">…</div>
            </div>
          )}
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={loadingModel ? "Loading model…" : "Write your message…"}
            disabled={loadingModel}
          />
          <button onClick={handleSend} disabled={loadingModel || sending}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
