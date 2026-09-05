# CSharpWorkbench Roslyn

This directory contains the reusable Roslyn formatting engine for C# Workbench.

## Projects

- `CSharpWorkbench.Roslyn.Core` targets `netstandard2.0` and contains transport-neutral formatting contracts and the Roslyn formatting pipeline.
- `CSharpWorkbench.Roslyn.Core.Tests` targets `net10.0` and validates the Core independently of VS Code, LSP, and process hosting.

The Core references `Microsoft.CodeAnalysis.CSharp.Workspaces` 5.3.0 as its minimum public API baseline. Shared and standalone hosts must use a compatible Roslyn runtime and expose their actual Core and Roslyn versions during handshake.

## Formatting Pipeline

1. Validate the request shape, span, and options.
2. Parse the source with `CSharpSyntaxTree`.
3. Apply optional Workbench syntax-aware rules.
4. Apply the public Roslyn `Formatter` with mapped formatting options.
5. Normalize document-level text options when formatting a document.
6. Return text changes in the original request source coordinate system.

Type-member snippets are parsed inside a synthetic class. Statement snippets are parsed inside a synthetic method. Synthetic wrappers and their indentation are removed before changes are returned.

## Capability Boundaries

The initial Core supports document, range, type-member snippet, and statement snippet formatting. It uses only public Roslyn APIs.

- `maxLineLength` is accepted by the shared contract but is not implemented by the standard Roslyn Formatter.
- Character encoding conversion is outside the string-based Core. UTF-8 BOM text normalization is supported.
- Public Roslyn options group events and indexers with properties, and local functions with methods. The Core does not use internal APIs to split those contexts.
- Recoverable syntax diagnostics do not automatically prevent formatting. Parse, configuration, formatting, and boundary failures throw a `CSharpFormattingException` and return no partial result.

## Validation

Run the Core tests directly:

```shell
dotnet test ./roslyn/CSharpWorkbench.Roslyn.slnx --configuration Release
```

The repository-level `npm run pretest` command also runs the Core tests.
