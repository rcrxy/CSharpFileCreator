# C# Workbench

C# Workbench is a collection of C# and Razor editing enhancements built on top of the official VS Code .NET tooling.

## Features

- Create C# and Razor files from project-aware templates.
- Resolve namespaces and C# language capabilities from the target project.
- Format conservative Razor Markup regions using `.editorconfig` indentation rules.

The initial formatter supports `indent_style`, `indent_size`, and `tab_width`. When a property is not configured,
the current editor indentation options are used before the Workbench default of four spaces.

Safety takes priority over coverage. Razor comments, explicit C# blocks, mixed lines containing Razor transitions,
multiline tags, and whitespace-sensitive or executable elements such as `pre`, `script`, `style`, and `textarea`
are preserved instead of being reformatted speculatively.

## Project Structure

```text
src/
├─ core/
│  └─ editorConfig/             # Shared EditorConfig parsing and normalized options
├─ features/
│  ├─ fileCreation/             # Commands, models, renderers, services and templates
│  └─ formatting/               # Formatting providers and language-specific services
├─ shared/
│  └─ csharp/                   # Reusable C# project and language capabilities
└─ index.ts                     # Feature composition root
```

Each feature exposes a registration function from its `index.ts`. The extension entry point only composes these
registrations. Features do not depend on each other; shared capabilities such as EditorConfig resolution belong in
`src/core`.

Formatting style is sourced from `.editorconfig`. VS Code settings remain appropriate for feature switches, UI,
performance, and other extension behavior, but do not duplicate code-style rules.
