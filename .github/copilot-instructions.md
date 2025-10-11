# GitHub Copilot Code Review Instructions

## Project Overview

This repository is a modular Slack bot built with Node.js and TypeScript. It integrates AI services (OpenAI, Gemini), supports image generation, alerts, tasks, notes, and provides both Slack and web interfaces (Express + Socket.io). The project uses TypeORM (SQLite/Supabase), Redis for caching, and follows layered architecture.

## Architecture & Patterns

- Modular structure: Each feature in `src/modules/{feature}` with controller, service, repository, and shared folders.
- Singleton pattern for controllers/services (`getInstance()`).
- Repository, Service, and Controller patterns.
- Dual interface: Slack (Bolt) and Web (Express/Socket.io).
- TypeORM entities in `src/entities`.
- Redis for conversation caching.
- Cron jobs for alerts.
- Error handling via custom error classes and global middleware.

**Do:**

- Keep business logic in services, not controllers.
- Use repositories for all data access (DB, Redis, APIs).
- Follow the singleton pattern for controllers/services.
- Use environment variables for secrets/configuration.
- Validate and sanitize all user input.
- Use custom error classes and global error middleware.
- Write tests for all new features and bug fixes.

**Don't:**

- Put business logic in controllers.
- Access the database directly from controllers/services (use repositories).
- Hardcode secrets, tokens, or personal information.
- Commit code with lint or type errors.
- Skip writing tests for new code.

## Coding Standards

- TypeScript, 2-space indentation, single quotes, no trailing semicolons.
- `camelCase` for variables/functions, `PascalCase` for classes.
- Interfaces prefixed with `I`, located in `src/shared/interfaces`.
- File naming: `{feature}.controller.ts`, `{feature}.service.ts`, etc.
- No personal information in code (names, emails, etc.).
- Use environment variables for secrets/configuration.
- Run `npm run lint` and address all warnings before merging.
- Format code with Prettier: `npx prettier --write "src/**/*.ts"`.

## Testing

- Jest with `ts-jest`, tests in `*.test.ts` files alongside code.
- Mock Slack and Redis integrations.
- Cover positive, negative, and regression cases.
- Validate coverage with `npm run test:coverage`.
- Strive for >80% coverage on new modules.
- Prefer unit tests for business logic, integration tests for controllers.

## Commit & PR Guidelines

- Use Conventional Commits (e.g., `feat(slack): improve cron alert message`).
- Summarize intent, list manual test commands, link issues, and attach screenshots for user-facing flows.
- Document environment changes and update `.env.example` or README as needed.

## Security & Privacy

- Never log or expose secrets, tokens, or personal information.
- Sanitize all user input and output.
- Use HTTPS for external API calls when possible.
- Validate permissions for sensitive actions.

## Performance

- Avoid blocking calls in event handlers.
- Use Redis efficiently for caching and conversation state.
- Profile and optimize slow queries or API calls.

## Accessibility & Internationalization

- Ensure web interface is accessible (ARIA, keyboard navigation).
- Support internationalization where possible.

## Review Instructions

- Ensure new code matches the modular structure and patterns above.
- Check for proper error handling and use of custom error classes.
- Validate that environment variables are used for secrets.
- Confirm code style and formatting.
- Require tests for new features and bug fixes.
- No personal information should be present.
- Review for security, maintainability, and adherence to architecture.
- Leave actionable, constructive feedback and suggest refactoring if needed.
