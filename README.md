# VaultAI — Your AI, Protected in Your Personal Vault

VaultAI is a privacy-first AI assistant that eliminates centralized data-center storage by running entirely on the user's device. Unlike traditional AI assistants that send conversations to remote servers, VaultAI performs AI inference locally using WebLLM and stores all user data in the browser using IndexedDB.

Your conversations, preferences, and documents remain under your control—encrypted, private, and never uploaded to the cloud.

---

## Features

- 🧠 Local AI Inference using WebLLM
- 🔒 Privacy First — No cloud processing
- 💬 Local Chat History stored in IndexedDB
- 🗂️ Conversation Management
- 📝 Personalized AI Memory built only from your own conversations
- 🌐 Works Offline after the model is downloaded
- ⚡ No Backend Required
- 🛡️ User-Owned Data with complete control over deletion

---

## Why VaultAI?

Today's AI assistants depend on massive data centers to process every prompt. This introduces privacy concerns, internet dependency, and centralized control over user data.

VaultAI takes a different approach.

Instead of sending your conversations to a server, VaultAI transforms your own device into a secure personal AI vault.

- AI runs locally.
- Conversations stay on your device.
- No prompts are uploaded.
- No cloud database stores your data.

---

🏗️ Architecture

                    User Device
                         │
        ┌─────────────────────────────────┐
        │                                 │
        │          React + Vite           │
        │                                 │
        │   ┌─────────────────────────┐   │
        │   │       WebLLM            │   │
        │   │ Local AI Inference      │   │
        │   └────────────┬────────────┘   │
        │                │                │
        │      IndexedDB (Dexie)          │
        │                │                │
        │     Conversations & Memory      │
        └─────────────────────────────────┘

          ❌ No Cloud Database
          ❌ No AI API Calls
          ❌ No Centralized Storage

---

## Tech Stack

- React
- TypeScript
- Vite
- WebLLM
- Dexie (IndexedDB)
- Tailwind CSS

---
## Privacy

VaultAI is built around one simple principle:

«Your AI should belong to you.»

All conversations and personalized memory remain on your own device.

VaultAI does not:

- Upload conversations to a server
- Store chat history in a cloud database
- Require an AI API for inference
- Share personal data with third parties

The only network activity is the initial download of the AI model. Once downloaded, inference happens entirely on-device.

---

## Use Cases

- Personal AI Assistant
- Offline AI Chat
- Privacy-Conscious Users
- Students & Researchers
- Professionals handling sensitive information
- Organizations with strict data privacy requirements

---

## Vision

We envision a future where users no longer have to trade privacy for intelligence.

VaultAI replaces centralized AI infrastructure with local, user-owned intelligence—giving every individual a secure personal AI that works entirely on their own device.


