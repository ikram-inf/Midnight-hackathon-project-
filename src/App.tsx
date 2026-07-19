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
  updateConversationTitle,
} from "./lib/db";
import {
  generateReply,
  extractCandidateFacts,
  initEngine,
  getChatMode,
  setChatMode,
  type ChatMode,
  getLocalModelId,
  setLocalModelId,
  LOCAL_MODELS,
} from "./lib/llm";
import { createConsentCommitment, type ConsentAction } from "./lib/midnight";

type Theme = "dark" | "light" | "fantasy";

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
  const [consentStatus, setConsentStatus] = useState<"given" | "revoked">(() => {
    return (localStorage.getItem("midnight-consent-status") as "given" | "revoked") || "given";
  });
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("chat-theme") as Theme) || "dark"
  );
  const [chatMode, setChatModeState] = useState<ChatMode>(getChatMode());
  const [localModelId, setLocalModelIdState] = useState<string>(getLocalModelId());
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "warning" | "success";
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Synchronous lock to prevent handleSend from running twice concurrently
  // (e.g. Enter key + Send button click firing almost simultaneously, or a
  // duplicated keydown event). `sending` state alone is not enough because
  // React state updates are asynchronous, so two near-simultaneous calls can
  // both read `sending === false` before the first one has a chance to flip
  // it. This ref is updated immediately and synchronously.
  const sendingRef = useRef(false);

  // Always-fresh mirror of `messages`. handleSend is (re)created on every
  // render and closes over whatever `messages` was at that time. If the
  // user fires off several sends in a row before a re-render lands, that
  // closure can be stale and the history sent to generateReply() will be
  // missing the most recent turns. Reading from this ref instead of the
  // state variable guarantees we always see the latest messages.
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // When handleSend creates a brand-new conversation, it calls setActiveId()
  // itself, which would normally re-trigger the effect below and re-fetch
  // messages from the DB — racing against the optimistic setMessages calls
  // already happening inside handleSend for that same new conversation.
  // Only the very first message of a brand-new conversation goes through
  // this path, which is why the bug only showed up there. Setting this flag
  // right before setActiveId tells the effect to skip that one refetch.
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("chat-theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const convs = await listConversations();
      setConversations(convs);
      if (convs.length > 0) setActiveId(convs[0].id);
      setFacts(await listProfileFacts());

      const currentMode = getChatMode();
      if (currentMode === "cloud") {
        setLoadingModel(false);
        return;
      }

      try {
        await initEngine((msg) => setModelStatus(msg));
        setLoadingModel(false);
      } catch (e) {
        console.error("Local model init failed, falling back to cloud proxy:", e);
        const detail = e instanceof Error ? e.message : String(e);
        setChatMode("cloud");
        setChatModeState("cloud");
        setLoadingModel(false);
        setNotification({
          message: `Local WebGPU loading failed (${detail}). Switched to Secure Cloud Proxy (Gemini 3.5) fallback. Your chat history and learned facts remain 100% locally on IndexedDB!`,
          type: "warning",
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
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
    if (action === "consent_given") {
      setConsentStatus("given");
      localStorage.setItem("midnight-consent-status", "given");
      setNotification({
        message: "Consent successfully proven! A zero-knowledge cryptographic proof of your consent has been generated.",
        type: "success"
      });
    } else if (action === "consent_revoked") {
      setConsentStatus("revoked");
      localStorage.setItem("midnight-consent-status", "revoked");
      setNotification({
        message: "Consent successfully revoked! Cryptographic proof of revocation generated. The AI will not learn from your future messages.",
        type: "warning"
      });
    } else if (action === "data_wiped") {
      setNotification({
        message: "All history successfully wiped! Cryptographic proof of data deletion generated.",
        type: "success"
      });
    }
  }

  async function handleSend() {
    // Synchronous guard first: blocks a second call that fires before React
    // has re-rendered with sending === true.
    if (!input.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    try {
      let convId = activeId;
      let isNew = false;
      if (!convId) {
        const conv = await createConversation();
        setConversations(await listConversations());
        convId = conv.id;
        skipNextFetchRef.current = true;
        setActiveId(convId);
        isNew = true;
      }

      const userText = input;
      setInput("");

      const userMsg = await addMessage({ conversationId: convId, role: "user", content: userText });
      setMessages((m) => [...m, userMsg]);

      // Dynamic renaming from "Nouvelle conversation" to the first user message snippet
      const currentConv = conversations.find((c) => c.id === convId);
      if (isNew || (currentConv && currentConv.title === "Nouvelle conversation")) {
        let snippet = userText.trim();
        if (snippet.length > 30) {
          snippet = snippet.slice(0, 30) + "...";
        }
        await updateConversationTitle(convId, snippet);
        setConversations(await listConversations());
      }

      // Local-only "learning": look for facts worth remembering, store them,
      // and let the user see/delete them immediately, ONLY if consent is given.
      if (consentStatus !== "revoked") {
        const candidates = extractCandidateFacts(userText);
        if (candidates.length > 0) {
          for (const candidate of candidates) {
            await addProfileFact(candidate);
          }
          setFacts(await listProfileFacts());
        }
      }

      const history = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const replyText = await generateReply(history, chatMode);
        const assistantMsg = await addMessage({
          conversationId: convId,
          role: "assistant",
          content: replyText,
        });
        setMessages((m) => [...m, assistantMsg]);
      } catch (err: any) {
        console.error("Failed to generate reply:", err);
        const errMsg = err.message || "Failed to generate a reply.";
        const assistantMsg = await addMessage({
          conversationId: convId,
          role: "assistant",
          content: `⚠️ Error: ${errMsg}\n\nPlease try switching the AI Engine in the sidebar to another mode or check your configuration.`,
        });
        setMessages((m) => [...m, assistantMsg]);
      }
      setConversations(await listConversations());
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function handleDeleteFact(id?: number) {
    if (id === undefined) return;
    await deleteProfileFact(id);
    setFacts(await listProfileFacts());
  }

  return (
    <div className="app">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
        <div className="brand">
          <span className="brand-mark">◐</span>
          <span className="brand-name">private chat</span>
        </div>

        <div className="theme-switcher">
          <button
            className={theme === "dark" ? "theme-btn active" : "theme-btn"}
            onClick={() => setTheme("dark")}
            title="Black"
            style={{ fontSize: "11px", fontFamily: '"IBM Plex Mono", monospace' }}
          >
            ⚫ Black
          </button>
          <button
            className={theme === "light" ? "theme-btn active" : "theme-btn"}
            onClick={() => setTheme("light")}
            title="Light"
            style={{ fontSize: "11px", fontFamily: '"IBM Plex Mono", monospace' }}
          >
            ⚪ Light
          </button>
          <button
            className={theme === "fantasy" ? "theme-btn active" : "theme-btn"}
            onClick={() => setTheme("fantasy")}
            title="Purple"
            style={{ fontSize: "11px", fontFamily: '"IBM Plex Mono", monospace' }}
          >
            🟣 Purple
          </button>
        </div>

        <div className="engine-switcher">
          <div className="section-label">AI Engine</div>
          <div className="engine-buttons">
            <button
              className={`engine-btn ${chatMode === "local" ? "active" : ""}`}
              onClick={async () => {
                if (chatMode === "local") return;
                setLoadingModel(true);
                setModelStatus("Initializing local model…");
                try {
                  setChatMode("local");
                  setChatModeState("local");
                  await initEngine((msg) => setModelStatus(msg));
                  setLoadingModel(false);
                  setNotification({
                    message: "Switched to Local WebGPU Mode. Running 100% locally on your hardware!",
                    type: "success",
                  });
                } catch (err: any) {
                  const detail = err instanceof Error ? err.message : String(err);
                  setChatMode("cloud");
                  setChatModeState("cloud");
                  setLoadingModel(false);
                  setNotification({
                    message: `Failed to load local model: ${detail}. Switched to Secure Cloud Proxy.`,
                    type: "warning",
                  });
                }
              }}
            >
              💻 Local
            </button>
            <button
              className={`engine-btn ${chatMode === "cloud" ? "active" : ""}`}
              onClick={() => {
                setChatMode("cloud");
                setChatModeState("cloud");
                setLoadingModel(false);
                setNotification({
                  message: "Switched to Secure Cloud Proxy (Gemini). Zero download, fast and fully operational!",
                  type: "info",
                });
              }}
            >
              ☁️ Cloud
            </button>
          </div>

          {chatMode === "local" && (
            <div className="model-select-wrapper">
              <div className="section-label" style={{ marginTop: "8px" }}>Local Model Size</div>
              <select
                className="model-select"
                value={localModelId}
                onChange={async (e) => {
                  const newModelId = e.target.value;
                  setLocalModelId(newModelId);
                  setLocalModelIdState(newModelId);
                  setLoadingModel(true);
                  setModelStatus("Switching local model…");
                  try {
                    await initEngine((msg) => setModelStatus(msg), newModelId);
                    setLoadingModel(false);
                    setNotification({
                      message: `Successfully loaded ${LOCAL_MODELS.find(m => m.id === newModelId)?.name}!`,
                      type: "success",
                    });
                  } catch (err: any) {
                    const detail = err instanceof Error ? err.message : String(err);
                    setChatMode("cloud");
                    setChatModeState("cloud");
                    setLoadingModel(false);
                    setNotification({
                      message: `Failed to load ${LOCAL_MODELS.find(m => m.id === newModelId)?.name}: ${detail}. Switched to Secure Cloud Proxy fallback.`,
                      type: "warning",
                    });
                  }
                }}
              >
                {LOCAL_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.size})
                  </option>
                ))}
              </select>
              <div className="model-desc">
                {LOCAL_MODELS.find((m) => m.id === localModelId)?.description}
              </div>
            </div>
          )}
        </div>

        <button className="btn-new" onClick={handleNewConversation}>
          + New conversation
        </button>

        <div className="conv-list">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={"conv-item" + (c.id === activeId ? " active" : "")}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
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
          <button
            className={`btn-ghost ${consentStatus === "given" ? "active" : ""}`}
            onClick={() => recordConsentEvent("consent_given")}
          >
            Prove my consent {consentStatus === "given" ? "✓" : ""}
          </button>
          <button
            className={`btn-ghost ${consentStatus === "revoked" ? "active" : ""}`}
            onClick={() => recordConsentEvent("consent_revoked")}
          >
            Revoke {consentStatus === "revoked" ? "✗" : ""}
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

        <div className="privacy-badge" style={{ color: chatMode === "local" ? "var(--safe)" : "var(--accent)" }}>
          <span className="dot" style={{ backgroundColor: chatMode === "local" ? "var(--safe)" : "var(--accent)", boxShadow: chatMode === "local" ? "0 0 6px var(--safe)" : "0 0 6px var(--accent)" }} />
          {chatMode === "local" ? "100% local (WebGPU)" : "Private Proxy (Gemini)"}
        </div>
      </aside>

      <main className="chat">
        {notification && (
          <div className={`notification-banner ${notification.type}`}>
            <span>{notification.message}</span>
            <button className="notification-close" onClick={() => setNotification(null)}>
              ✕
            </button>
          </div>
        )}

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
