# Supported Configurations

[简体中文](SUPPORTED_CONFIGURATIONS.zh-cn.md)

This document records configuration properties that C# Workbench currently interprets and applies. A property being
returned by the `editorconfig` parser does not mean that Workbench implements its behavior.

## EditorConfig

### Built-In Default Profile

C# Workbench expresses its fixed default formatting style through the bundled
[default EditorConfig Profile](src/core/editorConfig/profiles/default.editorconfig). The Profile is parsed with the
same EditorConfig section matching used for project files, including separate defaults for C#, Razor, and CSHTML.

The built-in Profile is the final fallback only. A matching project `.editorconfig` always has priority over it.
Values derived from the active editor or document remain dynamic and are resolved before the Profile, so the Profile
does not force a fixed tab size, line ending, maximum line length, final newline, whitespace cleanup, or charset over
the current editing context.

The general resolution order is:

1. Matching project `.editorconfig` property.
2. Current VS Code editor or document state, for properties with a dynamic equivalent.
3. Bundled default EditorConfig Profile.
4. Defensive code fallback, used only if the Profile cannot provide a valid value.

### Applied Properties

| Property       | Supported values        | Behavior                                                                                |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `indent_style` | `space`, `tab`          | Selects spaces or tab characters for each indentation level.                            |
| `indent_size`  | Positive integer, `tab` | Sets the logical indentation size. When set to `tab`, the resolved `tab_width` is used. |
| `tab_width`    | Positive integer        | Sets the tab width and resolves the size of `indent_size = tab`.                        |
| `max_line_length` | Positive integer, `off` | Wraps C# at safe comma and binary-operator boundaries. `off` disables line-length wrapping. |
| `end_of_line`  | `lf`, `crlf`            | Normalizes document line endings to the configured newline style.                       |
| `insert_final_newline` | `true`, `false` | Ensures the file ends with or without a final newline.                              |
| `trim_trailing_whitespace` | `true`, `false` | Removes trailing spaces and tabs before line breaks when enabled.               |
| `charset` | `utf-8`, `utf-8-bom` | Adds or removes the UTF-8 BOM when formatting. Other EditorConfig charset values are parsed but do not trigger file transcoding. |

These properties currently apply to Razor and C# document formatting. `max_line_length` currently wraps C# documents
and C# code inside Razor `@code` and `@functions` blocks; it does not wrap Razor markup attributes.

For C# **Format Document**, all properties in this table are applied. **Format Selection** applies indentation and
`trim_trailing_whitespace` only within the selected full lines; it does not change document-wide line endings, the
final newline, or the BOM.

### C# Indentation

| Property                                 | Supported values                                   | Default                 | Behavior                                                                         |
| ---------------------------------------- | -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `csharp_indent_block_contents`           | `true`, `false`                                    | `true`                  | Indents statements and declarations inside brace-delimited blocks.               |
| `csharp_indent_braces`                   | `true`, `false`                                    | `false`                 | Adds one indentation level to block braces.                                      |
| `csharp_indent_case_contents`            | `true`, `false`                                    | `true`                  | Indents statements under `case` and `default` labels.                            |
| `csharp_indent_switch_labels`            | `true`, `false`                                    | `true`                  | Indents `case` and `default` labels relative to the containing switch statement. |
| `csharp_indent_case_contents_when_block` | `true`, `false`                                    | `true`                  | Indents an explicit block and its statements under a case label.                 |
| `csharp_indent_labels`                   | `flush_left`, `one_less_than_current`, `no_change` | `one_less_than_current` | Controls indentation of ordinary statement labels.                               |

Both **Format Document** and **Format Selection** are supported for C# documents.
Razor `@code` and `@functions` blocks reuse the same C# formatter through the `CSharpCodeFormatter` interface.
`registerFormattingFeature` accepts an optional `CSharpCodeFormatter` when a different implementation should be used
for embedded Razor C# code.

### C# New Lines

| Property                            | Supported values                                                  | Default |
| ----------------------------------- | ----------------------------------------------------------------- | ------- |
| `csharp_new_line_before_open_brace` | `all`, `none`, or a comma-separated list of Roslyn brace contexts | `all`   |
| `csharp_new_line_before_else`       | `true`, `false`                                                   | `true`  |
| `csharp_new_line_before_catch`      | `true`, `false`                                                   | `true`  |
| `csharp_new_line_before_finally`    | `true`, `false`                                                   | `true`  |

Supported brace contexts are `accessors`, `anonymous_methods`, `anonymous_types`, `control_blocks`, `events`,
`indexers`, `lambdas`, `local_functions`, `methods`, `object_collection_array_initializers`, `properties`, and `types`.

### C# Spacing

| Property                                                 | Supported values                     | Default            |
| -------------------------------------------------------- | ------------------------------------ | ------------------ |
| `csharp_space_after_keywords_in_control_flow_statements` | `true`, `false`                      | `true`             |
| `csharp_space_around_binary_operators`                   | `before_and_after`, `none`, `ignore` | `before_and_after` |
| `csharp_space_after_comma`                               | `true`, `false`                      | `true`             |
| `csharp_space_before_comma`                              | `true`, `false`                      | `false`            |
| `csharp_space_after_semicolon_in_for_statement`          | `true`, `false`                      | `true`             |
| `csharp_space_before_semicolon_in_for_statement`         | `true`, `false`                      | `false`            |
| `csharp_space_after_cast`                                | `true`, `false`                      | `false`            |
| `csharp_space_before_colon_in_inheritance_clause`        | `true`, `false`                      | `true`             |
| `csharp_space_after_colon_in_inheritance_clause`         | `true`, `false`                      | `true`             |

### C# Wrapping And Preservation

| Property                                 | Supported values | Default |
| ---------------------------------------- | ---------------- | ------- |
| `csharp_preserve_single_line_statements` | `true`, `false`  | `true`  |
| `csharp_preserve_single_line_blocks`     | `true`, `false`  | `true`  |

Comments, regular strings, verbatim strings, raw strings, and character literals are protected from code-style text
transformations. The formatter is syntax-aware for the constructs listed above, but it is not a complete Roslyn syntax
tree implementation. Unsupported or ambiguous constructs are left unchanged where possible.

### HTML And Razor Tags

These property names follow the ReSharper/Rider HTML formatting rules. C# Workbench accepts both the documented
`html_*` form and the compatible `resharper_html_*` form. When both forms are present, the unprefixed `html_*` property
wins.

| Property                                                       | Supported values                                                                         | Default          | Behavior                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `html_spaces_around_eq_in_attribute`                           | `true`, `false`                                                                          | `false`          | Controls spaces around `=` in attributes.                                                                              |
| `html_space_after_last_attribute`                              | `true`, `false`                                                                          | `false`          | Controls the space between the last attribute and `>`.                                                                 |
| `html_space_before_self_closing`                               | `true`, `false`                                                                          | `true`           | Controls the space before `/>`.                                                                                        |
| `html_attribute_style`                                         | `on_single_line`, `first_attribute_on_single_line`, `on_different_lines`, `do_not_touch` | `on_single_line` | Controls attribute line layout.                                                                                        |
| `html_attribute_indent`                                        | `single_indent`, `double_indent`, `align_by_first_attribute`                             | `single_indent`  | Controls indentation of multiline attributes.                                                                          |
| `html_max_blank_lines_between_tags`                            | Non-negative integer                                                                     | `1`              | Limits blank lines between adjacent tags.                                                                              |
| `html_linebreak_before_all_elements`                           | `true`, `false`                                                                          | `false`          | Places every element on a new line when enabled.                                                                       |
| `html_linebreak_before_multiline_elements`                     | `true`, `false`                                                                          | `true`           | Places multiline elements on a new line.                                                                               |
| `html_linebreaks_inside_tags_for_multiline_elements`           | `true`, `false`                                                                          | `true`           | Places multiline element content between line breaks.                                                                  |
| `html_linebreaks_inside_tags_for_elements_with_child_elements` | `true`, `false`                                                                          | `true`           | Places child elements and the parent closing tag on separate lines when the parent has no direct text.                 |
| `html_no_indent_inside_elements`                               | Comma-separated element names                                                            | `pre,textarea`   | Prevents indentation changes inside the listed elements.                                                               |
| `html_preserve_spaces_inside_tags`                             | Comma-separated element names                                                            | `pre,textarea`   | Preserves the complete contents of the listed elements.                                                                |
| `html_extra_spaces`                                            | `remove_all`, `leave_tabs`, `leave_multiple`, `leave_all`                                | `remove_all`     | Removes redundant horizontal tag whitespace for `remove_all`; the `leave_*` values preserve existing extra whitespace. |

HTML-specific indentation aliases are also supported:

```ini
html_indent_style = space
html_indent_size = 4
html_tab_width = 4
```

Razor directives and `@code`/`@functions` blocks are protected while tags are parsed. The embedded C# blocks are then
formatted by the configured `CSharpCodeFormatter`.

#### HTML Resolution Priority

HTML/Razor tag formatting uses this priority for every applicable setting:

1. The unprefixed `html_*` property from the project `.editorconfig`.
2. The compatible `resharper_html_*` property, then the equivalent standard project EditorConfig property when one exists.
3. The current VS Code editor setting.
4. The corresponding property from the bundled default EditorConfig Profile.

For indentation, the complete chain is `html_indent_*` → `resharper_html_indent_*` → standard `indent_*`/
`tab_width` → current `TextEditor.options` → bundled Profile. HTML rules without a standard EditorConfig or VS Code
equivalent fall back directly from their project language-specific forms to the bundled Profile.

### Resolution Priority

Dynamic indentation properties and `max_line_length` are resolved independently using this priority:

1. Matching `.editorconfig` property.
2. Current VS Code editor options.
3. Bundled default EditorConfig Profile.

The VS Code fallback values are:

| Workbench value                | VS Code editor option             |
| ------------------------------ | --------------------------------- |
| Indentation style              | `TextEditor.options.insertSpaces` |
| Indentation size and tab width | `TextEditor.options.tabSize`      |
| Maximum line length            | `editor.wordWrapColumn`           |

The bundled Profile currently contains:

```ini
indent_style = space
indent_size = 4
tab_width = 4
max_line_length = 80
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

Wrap C# code at 120 columns, or disable formatter-driven line wrapping:

```ini
[*.cs]
max_line_length = 120

[Generated/*.cs]
max_line_length = off
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
- C# formatting properties other than the indentation, new-line, spacing, and preservation options listed above
- HTML formatting properties other than the tag rules listed above

Move a property into the applied-properties table only after a Workbench feature implements and validates its behavior.

## VS Code Settings

C# Workbench currently defines no extension-specific formatting-style settings. VS Code editor indentation options are
used only as fallback values when the corresponding `.editorconfig` properties are absent.
