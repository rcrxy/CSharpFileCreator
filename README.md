# C# Workbench README

## Features

### 1.0.0

## Project Structure

```text
src/
├─ core/                         # Extension lifecycle contracts
├─ features/
│  └─ fileCreation/             # Commands, models, renderers, services and templates
├─ shared/
│  └─ csharp/                   # Reusable C# project and language capabilities
└─ index.ts                     # Feature composition root
```

Each feature exposes a registration function from its `index.ts`. The extension entry point only composes these
registrations, so future C# and Razor formatting features can be added under `src/features` without coupling them to
file creation commands.

Code formatting modules should reuse `src/shared/csharp` for project discovery and language-version-aware behavior.
Feature-specific commands, providers and configuration remain inside their own feature directory.


**Enjoy!**
