# 支持的配置

[English](SUPPORTED_CONFIGURATIONS.md)

本文档记录 C# Workbench 当前能够识别并实际应用的配置属性。属性能够被 `editorconfig` 解析器返回，并不代表
Workbench 已经实现其对应行为。

## EditorConfig

### 内置默认 Profile

C# Workbench 通过内置的[默认 EditorConfig Profile](src/core/editorConfig/profiles/default.editorconfig)表达固定的
默认格式化风格。该 Profile 使用与项目配置相同的 EditorConfig section 匹配机制解析，并为 C#、Razor 和
CSHTML 提供对应的默认配置。

内置 Profile 只作为最终 fallback。项目中匹配的 `.editorconfig` 始终拥有更高优先级。依赖当前编辑器或文档
状态的值会在 Profile 之前动态解析，因此 Profile 不会强制覆盖当前编辑上下文中的 Tab 宽度、换行符、最大行宽、
文件末尾换行、尾随空白处理或字符集。

通用解析顺序如下：

1. 项目中匹配的 `.editorconfig` 属性。
2. 对于存在动态等价项的属性，使用当前 VS Code 编辑器或文档状态。
3. 扩展内置的默认 EditorConfig Profile。
4. 仅当 Profile 无法提供有效值时使用代码中的防御性 fallback。

### 已应用的通用属性

| 属性                       | 支持的值             | 行为                                                              |
| -------------------------- | -------------------- | ----------------------------------------------------------------- |
| `indent_style`             | `space`、`tab`       | 选择每一级缩进使用空格还是制表符。                                |
| `indent_size`              | 正整数、`tab`        | 设置逻辑缩进宽度；设置为 `tab` 时使用解析后的 `tab_width`。       |
| `tab_width`                | 正整数               | 设置 Tab 可视宽度，并参与解析 `indent_size = tab`。               |
| `max_line_length`          | 正整数、`off`        | 在安全的逗号和二元运算符边界换行 C#；启用 HTML 属性换行时也用于判断 Razor/HTML 开始标签是否超长；`off` 关闭基于行宽的换行。 |
| `end_of_line`              | `lf`、`crlf`         | 将文档换行符统一为配置值。                                        |
| `insert_final_newline`     | `true`、`false`      | 确保文件包含或不包含末尾换行。                                    |
| `trim_trailing_whitespace` | `true`、`false`      | 启用时删除换行符前的尾随空格和 Tab。                              |
| `charset`                  | `utf-8`、`utf-8-bom` | 添加或移除 UTF-8 BOM；其他字符集值可被解析，但不会触发文件转码。  |

这些属性当前应用于 Razor 和 C# 文档格式化。`max_line_length` 会处理 C# 文档以及 Razor `@code`、
`@functions` 中的 C# 代码；当 `html_attribute_wrap = normal` 时，也会用于判断 Razor/HTML 标签属性是否换行。

对于 C# **格式化文档**，会应用表中的全部属性。**格式化选定内容**只对选中的完整行应用缩进和
`trim_trailing_whitespace`，不会改变整个文档的换行符、末尾换行或 BOM。

### C# 缩进

| 属性                                     | 支持的值                                           | 默认值                  | 行为                                                    |
| ---------------------------------------- | -------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `csharp_indent_block_contents`           | `true`、`false`                                    | `true`                  | 缩进大括号代码块中的语句和声明。                        |
| `csharp_indent_braces`                   | `true`、`false`                                    | `false`                 | 为代码块大括号增加一级缩进。                            |
| `csharp_indent_case_contents`            | `true`、`false`                                    | `true`                  | 缩进 `case` 和 `default` 标签下的语句。                 |
| `csharp_indent_switch_labels`            | `true`、`false`                                    | `true`                  | 相对包含它们的 `switch` 缩进 `case` 和 `default` 标签。 |
| `csharp_indent_case_contents_when_block` | `true`、`false`                                    | `true`                  | 缩进 case 标签下的显式代码块及其语句。                  |
| `csharp_indent_labels`                   | `flush_left`、`one_less_than_current`、`no_change` | `one_less_than_current` | 控制普通语句标签的缩进。                                |

C# 文档同时支持**格式化文档**和**格式化选定内容**。Razor `@code` 与 `@functions` 代码块通过
`CSharpCodeFormatter` 接口复用同一个 C# 格式化器。`registerFormattingFeature` 也可以接收自定义
`CSharpCodeFormatter`，用于替换 Razor 内嵌 C# 的格式化实现。

`csharp_indent_block_contents` 同样应用于 Razor 控制块内的 C# 语句和标记。支持的控制结构包括
`@if`/`else if`/`else`、`@for`、`@foreach`、`@while`、`@switch`、`@using`、`@lock`、
`@try`/`catch`/`finally` 和 `@do`/`while`。启用该属性时，块内容会额外增加一级缩进。

### C# 换行

| 属性                                | 支持的值                                         | 默认值 |
| ----------------------------------- | ------------------------------------------------ | ------ |
| `csharp_new_line_before_open_brace` | `all`、`none` 或以逗号分隔的 Roslyn 大括号上下文 | `all`  |
| `csharp_new_line_before_else`       | `true`、`false`                                  | `true` |
| `csharp_new_line_before_catch`      | `true`、`false`                                  | `true` |
| `csharp_new_line_before_finally`    | `true`、`false`                                  | `true` |

支持的大括号上下文包括 `accessors`、`anonymous_methods`、`anonymous_types`、`control_blocks`、`events`、
`indexers`、`lambdas`、`local_functions`、`methods`、`object_collection_array_initializers`、`properties` 和
`types`。

Razor 控制块同样应用这些换行规则。其左花括号使用 `csharp_new_line_before_open_brace` 的
`control_blocks` 上下文；`csharp_new_line_before_else`、`csharp_new_line_before_catch` 和
`csharp_new_line_before_finally` 分别控制连续关键字是否与前一个右花括号同行。Razor `@do`/`while` 固定格式化为
`} while (...);`。

### C# 空格

| 属性                                                     | 支持的值                             | 默认值             |
| -------------------------------------------------------- | ------------------------------------ | ------------------ |
| `csharp_space_after_keywords_in_control_flow_statements` | `true`、`false`                      | `true`             |
| `csharp_space_around_binary_operators`                   | `before_and_after`、`none`、`ignore` | `before_and_after` |
| `csharp_space_after_comma`                               | `true`、`false`                      | `true`             |
| `csharp_space_before_comma`                              | `true`、`false`                      | `false`            |
| `csharp_space_after_semicolon_in_for_statement`          | `true`、`false`                      | `true`             |
| `csharp_space_before_semicolon_in_for_statement`         | `true`、`false`                      | `false`            |
| `csharp_space_after_cast`                                | `true`、`false`                      | `false`            |
| `csharp_space_before_colon_in_inheritance_clause`        | `true`、`false`                      | `true`             |
| `csharp_space_after_colon_in_inheritance_clause`         | `true`、`false`                      | `true`             |

### C# 包装与单行保留

| 属性                                     | 支持的值        | 默认值 |
| ---------------------------------------- | --------------- | ------ |
| `csharp_preserve_single_line_statements` | `true`、`false` | `true` |
| `csharp_preserve_single_line_blocks`     | `true`、`false` | `true` |

代码风格文本转换会保护注释、普通字符串、verbatim 字符串、raw string 和字符字面量。格式化器能识别上述构造，
但并不是完整的 Roslyn 语法树实现。对于不支持或存在歧义的构造，会尽可能保持不变。

### HTML 与 Razor 标签

这些属性名称沿用 ReSharper/Rider HTML 格式化规则。C# Workbench 同时接受文档中的 `html_*` 形式和兼容的
`resharper_html_*` 形式。两种形式同时存在时，无前缀的 `html_*` 属性优先。

| 属性                                                           | 支持的值                                                                                 | 默认值           | 行为                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `html_spaces_around_eq_in_attribute`                           | `true`、`false`                                                                          | `false`          | 控制属性 `=` 两侧的空格。                                           |
| `html_space_after_last_attribute`                              | `true`、`false`                                                                          | `false`          | 控制最后一个属性和 `>` 之间的空格。                                 |
| `html_space_before_self_closing`                               | `true`、`false`                                                                          | `true`           | 控制 `/>` 前的空格。                                                |
| `html_attribute_style`                                         | `on_single_line`、`first_attribute_on_single_line`、`on_different_lines`、`do_not_touch` | `on_single_line` | 控制属性行布局。                                                    |
| `html_attribute_wrap`                                          | `off`、`normal`、`on_every_item`、`split_into_lines`                                    | `off`            | 控制是否因 `max_line_length` 触发属性换行。`normal` 在格式化后的开始标签不超长时保持单行，超长后按 `html_attribute_style` 布局。`on_every_item` 和 `split_into_lines` 目前仅解析，尚未应用。 |
| `ij_html_attribute_wrap`                                       | `off`、`normal`、`on_every_item`、`split_into_lines`                                    | `off`            | `html_attribute_wrap` 的兼容别名；两者同时存在时标准键优先。`on_every_item` 和 `split_into_lines` 目前仅解析，尚未应用。 |
| `html_attribute_indent`                                        | `single_indent`、`double_indent`、`align_by_first_attribute`                             | `single_indent`  | 控制多行属性的缩进。                                                |
| `html_max_blank_lines_between_tags`                            | 非负整数                                                                                 | `1`              | 限制相邻标签之间的空白行数量。                                      |
| `html_linebreak_before_all_elements`                           | `true`、`false`                                                                          | `false`          | 启用时将每个元素放到新行。                                          |
| `html_linebreak_before_multiline_elements`                     | `true`、`false`                                                                          | `true`           | 将多行元素放到新行。                                                |
| `html_linebreaks_inside_tags_for_multiline_elements`           | `true`、`false`                                                                          | `true`           | 将多行元素的内容放在开始、结束标签之间的独立行。                    |
| `html_linebreaks_inside_tags_for_elements_with_child_elements` | `true`、`false`                                                                          | `true`           | 当父元素没有直接文本时，将子元素和父闭合标签分别放到独立行。        |
| `html_no_indent_inside_elements`                               | 以逗号分隔的元素名                                                                       | `pre,textarea`   | 不修改所列元素内部的缩进。                                          |
| `html_preserve_spaces_inside_tags`                             | 以逗号分隔的元素名                                                                       | `pre,textarea`   | 完整保留所列元素的内容。                                            |
| `html_extra_spaces`                                            | `remove_all`、`leave_tabs`、`leave_multiple`、`leave_all`                                | `remove_all`     | `remove_all` 删除标签中的冗余水平空白；`leave_*` 保留已有额外空白。 |

还支持以下 HTML 专属缩进别名：

```ini
html_indent_style = space
html_indent_size = 4
html_tab_width = 4
```

解析标签时会保护 Razor 指令以及 `@code`、`@functions` 代码块，随后再由配置的 `CSharpCodeFormatter`
格式化其中的 C# 代码。

#### HTML 解析优先级

HTML/Razor 标签格式化对每项适用配置使用以下优先级：

1. 项目 `.editorconfig` 中无前缀的 `html_*` 属性。
2. 兼容的 `resharper_html_*` 属性；存在等价标准属性时，再使用项目中的标准 EditorConfig 属性。
3. 当前 VS Code 编辑器设置。
4. 内置默认 EditorConfig Profile 中的对应属性。

缩进的完整解析链为：`html_indent_*` → `resharper_html_indent_*` → 标准 `indent_*`/`tab_width` → 当前
`TextEditor.options` → 内置 Profile。对于不存在标准 EditorConfig 或 VS Code 等价项的 HTML 规则，会从项目的
语言专属配置直接回退到内置 Profile。

### 动态配置解析优先级

动态缩进属性和 `max_line_length` 独立使用以下优先级：

1. 匹配的项目 `.editorconfig` 属性。
2. 当前 VS Code 编辑器选项。
3. 内置默认 EditorConfig Profile。

VS Code fallback 映射如下：

| Workbench 值        | VS Code 编辑器选项                |
| ------------------- | --------------------------------- |
| 缩进风格            | `TextEditor.options.insertSpaces` |
| 缩进宽度和 Tab 宽度 | `TextEditor.options.tabSize`      |
| 最大行宽            | `editor.wordWrapColumn`           |

内置 Profile 当前包含：

```ini
indent_style = space
indent_size = 4
tab_width = 4
max_line_length = 80
```

### 示例

Razor 文件使用两个空格缩进：

```ini
[*.razor]
indent_style = space
indent_size = 2
```

使用宽度为四列的 Tab：

```ini
[*.razor]
indent_style = tab
indent_size = tab
tab_width = 4
```

将 C# 代码限制为 120 列，或者关闭格式化器主动换行：

```ini
[*.cs]
max_line_length = 120

[Generated/*.cs]
max_line_length = off
```

### EditorConfig 发现与匹配

C# Workbench 将 EditorConfig 的发现与匹配交给 EditorConfig Core，包括：

- 从目标文件目录向文件系统根目录搜索。
- 合并多个 `.editorconfig` 文件中匹配的 section。
- 应用 section glob 模式。
- 在 `root = true` 处停止继续搜索。
- 应用 `unset` 语义。

### 已解析但尚未应用

解析后的属性映射中还可能包含其他 EditorConfig 和 .NET 代码风格属性，但 Workbench 目前不会执行其行为，例如：

- `utf-16be`
- `utf-16le`
- `latin1` 字符集转码
- `dotnet_*`
- 除上文所列缩进、换行、空格和单行保留规则之外的 C# 格式化属性
- 除上文所列标签规则之外的 HTML 格式化属性

只有在 Workbench 已实现并验证某项属性后，才应将其移动到“已应用”列表。

## VS Code 设置

C# Workbench 当前没有定义扩展专属的格式化风格设置。VS Code 编辑器选项只在对应 `.editorconfig` 属性缺失时
作为动态 fallback 使用。
