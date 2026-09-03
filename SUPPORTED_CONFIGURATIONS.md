# Supported Configurations

This document records configuration properties that C# Workbench currently interprets and applies. A property being
returned by the `editorconfig` parser does not mean that Workbench implements its behavior.

## EditorConfig

### Applied Properties

| Property       | Supported values        | Behavior                                                                                |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `indent_style` | `space`, `tab`          | Selects spaces or tab characters for each indentation level.                            |
| `indent_size`  | Positive integer, `tab` | Sets the logical indentation size. When set to `tab`, the resolved `tab_width` is used. |
| `tab_width`    | Positive integer        | Sets the tab width and resolves the size of `indent_size = tab`.                        |
| `end_of_line`  | `lf`, `crlf`            | Normalizes document line endings to the configured newline style.                       |
| `insert_final_newline` | `true`, `false` | Ensures the file ends with or without a final newline.                              |
| `trim_trailing_whitespace` | `true`, `false` | Removes trailing spaces and tabs before line breaks when enabled.               |
| `charset` | `utf-8`, `utf-8-bom` | Adds or removes the UTF-8 BOM when formatting. Other EditorConfig charset values are parsed but do not trigger file transcoding. |

These properties currently apply to Razor document formatting.

### Resolution Priority

Each indentation property is resolved independently using this priority:

1. Matching `.editorconfig` property.
2. Current VS Code editor options.
3. C# Workbench default.

The VS Code fallback values are:

| Workbench value                | VS Code editor option             |
| ------------------------------ | --------------------------------- |
| Indentation style              | `TextEditor.options.insertSpaces` |
| Indentation size and tab width | `TextEditor.options.tabSize`      |

The Workbench defaults are:

```ini
indent_style = space
indent_size = 4
tab_width = 4
```

### Examples

Use two spaces for Razor files:

```ini
[*.razor]
indent_style = space
indent_size = 2
```

Use tabs with a width of four columns:

```ini
[*.razor]
indent_style = tab
indent_size = tab
tab_width = 4
```

### EditorConfig Discovery

C# Workbench delegates EditorConfig discovery and matching to EditorConfig Core. This includes:

- Searching from the target file directory toward the filesystem root.
- Merging matching sections from multiple `.editorconfig` files.
- Applying section glob patterns.
- Stopping at `root = true`.
- Applying `unset` semantics.

### Parsed but Not Applied

Other EditorConfig and .NET code-style properties may be present in the parsed property map, but Workbench does not
currently execute them. This includes properties such as:

- `utf-16be`
- `utf-16le`
- `latin1` charset transcoding
- `dotnet_*`
- `csharp_*`

Move a property into the applied-properties table only after a Workbench feature implements and validates its behavior.

## VS Code Settings

C# Workbench currently defines no extension-specific formatting-style settings. VS Code editor indentation options are
used only as fallback values when the corresponding `.editorconfig` properties are absent.
