VaultAI 🔐

Your AI, Protected in Your Personal Vault

VaultAI is a privacy-first AI assistant that eliminates centralized data-center storage by running AI directly on the user's device. Instead of uploading conversations and personal data to cloud servers, VaultAI keeps everything local, encrypted, and under the user's complete control.

🚀 Overview

Traditional AI assistants rely on cloud infrastructure where conversations and personal information are stored in centralized data centers. VaultAI takes a different approach.

Using browser-based LLMs and local storage technologies, VaultAI transforms the user's own device into a secure personal AI vault.

- 🖥️ AI inference runs locally using WebLLM
- 🔒 Conversations remain on the user's device
- 📁 Personal knowledge is stored locally
- 🚫 No centralized chat storage
- 🔐 User retains complete ownership of their data

✨ Features

- Local AI Assistant powered by WebLLM
- Private conversations stored locally
- AI memory personalized for each user
- Conversation history management
- Delete individual conversations
- Wipe all local data at any time
- Works without sending prompts to AI servers
- Offline-ready after the model is downloaded

🛠 Tech Stack

Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

AI

- WebLLM
- MLC AI

Local Storage

- IndexedDB
- Dexie.js

Cryptography

- Web Crypto API

🏗 Architecture

                User

                  │

                  ▼

        ┌──────────────────────┐
        │     Web Browser      │
        ├──────────────────────┤
        │  Local LLM (WebLLM)  │
        │                      │
        │  IndexedDB (Dexie)   │
        │                      │
        │  Local AI Memory     │
        │                      │
        │  Local Conversations │
        │                      │
        │  Web Crypto API      │
        └──────────────────────┘

                  │

          No Cloud Database
          No AI API Calls
          No Data Centre Storage

🎯 Problem Statement

Modern AI assistants require users to send personal conversations, documents, and preferences to centralized servers. This raises concerns regarding privacy, ownership, compliance, and long-term security.

Users should not have to sacrifice privacy to benefit from AI.

💡 Our Solution

VaultAI eliminates centralized AI data storage by executing AI models directly on the user's device.

Instead of storing conversations in remote databases, all user data remains inside the browser using local storage technologies. The user owns their data, controls its lifecycle, and can delete everything whenever they choose.

🔐 Privacy First

VaultAI follows a simple principle:

«Your AI belongs to you. Your data belongs to you.»

The application:

- Does not upload conversations to centralized databases
- Does not require cloud AI inference
- Keeps conversations inside the user's browser
- Gives users complete control over deleting their data

⚙ Installation

git clone <repository-url>

cd vaultai

npm install

npm run dev

📂 Project Structure

src/
 ├── components/
 ├── lib/
 │    ├── llm.ts
 │    ├── db.ts
 │    └── midnight.ts
 ├── pages/
 ├── hooks/
 └── App.tsx

🌍 Future Scope

- End-to-end encrypted vaults
- Secure backup and restore
- Local document search
- Multi-device encrypted synchronization
- Voice assistant
- On-device Retrieval-Augmented Generation (RAG)
- Password-protected encrypted vault

🤝 Contributing

Contributions are welcome. Feel free to open issues, submit pull requests, or suggest improvements.

