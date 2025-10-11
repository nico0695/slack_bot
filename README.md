# 🤖 AI-Powered Slack Bot

An intelligent Slack bot integrating various AI services to provide conversational AI, image generation, and more. This project also features a web interface with real-time communication capabilities.

## ✨ Features

- **Conversational AI:** Engage with AI models (OpenAI, Gemini) directly within Slack.
- **Image Generation:** Create images from prompts using integrated AI services.
- **Real-time Web Interface:** A web dashboard with real-time updates via Socket.io.
- **Persistent Storage:** Utilizes a database sqlite for data persistence.
- **Caching:** Leverages Redis for efficient data caching.
- **Modular Architecture:** Organized into distinct modules for maintainability and scalability.

## 🚀 Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/en/) (LTS version recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Redis Server](https://redis.io/docs/getting-started/installation/)
  - _For Linux/macOS:_ `sudo apt-get install redis-server` (or equivalent for your package manager)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd slack_bot
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the project root based on `.env.example` (or the `Env` section below) and fill in your credentials.

        ```
        # SLACK
        SLACK_SIGNING_SECRET="your_slack_signing_secret"
        SLACK_BOT_TOKEN="your_slack_bot_token"
        APP_TOKEN="your_slack_app_token"

        # OPEN AI
        OPENAI_API_KEY="your_openai_api_key"

        # GEMINI (if applicable)
        GEMINI_API_KEY="your_gemini_api_key"

        # LEAP (tryleap.ai)
        LEAP_API_KEY="your_leap_api_key"

        # SUPABASE (or other database)
        SUPABASE_URL="your_supabase_url"
        SUPABASE_TOKEN="your_supabase_token"

        # WEB PUSH NOTIFICATIONS
        VAPID_PUBLIC_KEY="your_vapid_public_key"

    VAPID_PRIVATE_KEY="your_vapid_private_key"

    ```
    _Note: Replace placeholder values with your actual API keys and secrets._
    ```

### Running the Application

1.  **Start Redis Server:**
    ```bash
    redis-server
    ```
2.  **Start the Backend (Development Mode):**

    ```bash
    npm run dev
    ```

    The application will restart automatically on code changes.

3.  **Build and Start (Production Mode):**
    ```bash
    npm run build
    npm start
    ```

## 🛠️ Development

### Technologies Used

- **Backend:** Node.js, Express.js, TypeScript
- **Slack Integration:** Bolt Framework
- **Real-time Communication:** Socket.io
- **Database:** TypeORM (configured for Supabase)
- **Caching:** Redis
- **AI Integrations:** OpenAI, Gemini, Leap AI, Transformers.js
- **Linting:** ESLint
- **Testing:** Jest
- **Pre-commit Hooks:** Husky

### Project Structure

The project follows a modular structure:

```
src/
├── app.ts              # Main application setup
├── index.ts            # Application entry point
├── config/             # Configuration files (Slack, Redis, DB, etc.)
├── database/           # Database connection and setup
├── entities/           # TypeORM entities (database models)
├── modules/            # Feature-specific modules (alerts, conversations, images, etc.)
│   ├── [feature-name]/ # Each module contains its own controllers, services, repositories
│   └── ...
├── shared/             # Shared utilities, middleware, constants, interfaces
└── ...
```

### Linting and Testing

- **Linting:**
  ```bash
  npm run lint
  ```
- **Testing:**
  ```bash
  npm run test
  ```
- **Pre-commit Hooks:** Husky is configured to run linting and tests automatically before each commit.
