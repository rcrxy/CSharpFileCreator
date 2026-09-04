import { parse, type Props } from "editorconfig";
import type * as vscode from "vscode";
import { defaultIndentationOptions } from "./defaults";
import type {
    Charset,
    CSharpBinaryOperatorSpacing,
    CSharpIndentationOptions,
    CSharpLabelIndentation,
    CSharpNewLineOptions,
    CSharpOpenBraceContext,
    CSharpSpacingOptions,
    CSharpWrappingOptions,
    EditorConfigFallback,
    HtmlAttributeIndent,
    HtmlAttributeStyle,
    HtmlExtraSpaces,
    HtmlFormattingOptions,
    IndentationOptions,
    IndentationStyle,
    LineEnding,
    WorkbenchEditorConfig,
} from "./models";

export async function resolveEditorConfig(
    resource: vscode.Uri,
    fallback: EditorConfigFallback = {},
): Promise<WorkbenchEditorConfig> {
    const properties = await parseEditorConfig(resource);

    return {
        indentation: resolveIndentationOptions(properties, fallback),
        maxLineLength: resolveMaxLineLength(properties.max_line_length, fallback.maxLineLength),
        csharpIndentation: resolveCSharpIndentationOptions(properties),
        csharpNewLines: resolveCSharpNewLineOptions(properties),
        csharpSpacing: resolveCSharpSpacingOptions(properties),
        csharpWrapping: resolveCSharpWrappingOptions(properties),
        html: resolveHtmlFormattingOptions(properties, fallback),
        lineEnding: resolveLineEnding(properties.end_of_line, fallback.lineEnding),
        insertFinalNewline: resolveBoolean(properties.insert_final_newline, fallback.insertFinalNewline, true),
        trimTrailingWhitespace: resolveBoolean(properties.trim_trailing_whitespace, fallback.trimTrailingWhitespace, false),
        charset: resolveCharset(properties.charset, fallback.charset),
        properties,
    };
}

export function resolveHtmlFormattingOptions(
    properties: Readonly<Props>,
    fallback: EditorConfigFallback = {},
): HtmlFormattingOptions {
    return {
        indentation: resolveHtmlIndentationOptions(properties, fallback),
        spacesAroundAttributeEquals: resolveHtmlBoolean(properties, "html_spaces_around_eq_in_attribute", false),
        spaceAfterLastAttribute: resolveHtmlBoolean(properties, "html_space_after_last_attribute", false),
        spaceBeforeSelfClosing: resolveHtmlBoolean(properties, "html_space_before_self_closing", true),
        attributeStyle: resolveHtmlEnum(
            properties,
            "html_attribute_style",
            ["on_single_line", "first_attribute_on_single_line", "on_different_lines", "do_not_touch"],
            "on_single_line",
        ),
        attributeIndent: resolveHtmlEnum(
            properties,
            "html_attribute_indent",
            ["single_indent", "double_indent", "align_by_first_attribute"],
            "single_indent",
        ),
        maxBlankLinesBetweenTags: resolveHtmlNonNegativeInteger(properties, "html_max_blank_lines_between_tags", 1),
        lineBreakBeforeAllElements: resolveHtmlBoolean(properties, "html_linebreak_before_all_elements", false),
        lineBreakBeforeMultilineElements: resolveHtmlBoolean(properties, "html_linebreak_before_multiline_elements", true),
        lineBreaksInsideMultilineElements: resolveHtmlBoolean(
            properties,
            "html_linebreaks_inside_tags_for_multiline_elements",
            true,
        ),
        lineBreaksInsideElementsWithChildElements: resolveHtmlBoolean(
            properties,
            "html_linebreaks_inside_tags_for_elements_with_child_elements",
            true,
        ),
        noIndentInsideElements: resolveHtmlElementSet(properties, "html_no_indent_inside_elements", ["pre", "textarea"]),
        preserveSpacesInsideTags: resolveHtmlElementSet(properties, "html_preserve_spaces_inside_tags", ["pre", "textarea"]),
        extraSpaces: resolveHtmlEnum(
            properties,
            "html_extra_spaces",
            ["remove_all", "leave_tabs", "leave_multiple", "leave_all"],
            "remove_all",
        ),
    };
}

function resolveHtmlIndentationOptions(properties: Readonly<Props>, fallback: EditorConfigFallback): IndentationOptions {
    const htmlProperties: Props = {
        indent_style:
            (resolveHtmlProperty(properties, "html_indent_style") as Props["indent_style"]) ?? properties.indent_style,
        indent_size: (resolveHtmlProperty(properties, "html_indent_size") as Props["indent_size"]) ?? properties.indent_size,
        tab_width: (resolveHtmlProperty(properties, "html_tab_width") as Props["tab_width"]) ?? properties.tab_width,
    };
    return resolveIndentationOptions(htmlProperties, fallback);
}

function resolveHtmlBoolean(properties: Readonly<Props>, name: string, defaultValue: boolean): boolean {
    return resolveCustomBoolean(resolveHtmlProperty(properties, name), defaultValue);
}

function resolveHtmlEnum<T extends string>(
    properties: Readonly<Props>,
    name: string,
    values: readonly T[],
    defaultValue: T,
): T {
    const value = resolveHtmlProperty(properties, name);
    return typeof value === "string" && values.includes(value as T) ? (value as T) : defaultValue;
}

function resolveHtmlNonNegativeInteger(properties: Readonly<Props>, name: string, defaultValue: number): number {
    const value = resolveHtmlProperty(properties, name);
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        return Number.parseInt(value, 10);
    }
    return defaultValue;
}

function resolveHtmlElementSet(properties: Readonly<Props>, name: string, defaults: readonly string[]): ReadonlySet<string> {
    const value = resolveHtmlProperty(properties, name);
    if (typeof value !== "string") {
        return new Set(defaults);
    }

    return new Set(
        value
            .split(",")
            .map(item => item.trim().toLowerCase())
            .filter(Boolean),
    );
}

function resolveHtmlProperty(properties: Readonly<Props>, name: string): unknown {
    return properties[name] ?? properties[`resharper_${name}`];
}

export function resolveMaxLineLength(value: unknown, fallback?: number): number | undefined {
    if (value === "off") {
        return undefined;
    }

    return positiveInteger(value) ?? positiveIntegerString(value) ?? positiveInteger(fallback) ?? 80;
}

const csharpOpenBraceContexts = new Set<CSharpOpenBraceContext>([
    "accessors",
    "anonymous_methods",
    "anonymous_types",
    "control_blocks",
    "events",
    "indexers",
    "lambdas",
    "local_functions",
    "methods",
    "object_collection_array_initializers",
    "properties",
    "types",
]);

export function resolveCSharpNewLineOptions(properties: Readonly<Props>): CSharpNewLineOptions {
    return {
        beforeOpenBrace: resolveOpenBraceContexts(properties.csharp_new_line_before_open_brace),
        beforeElse: resolveCustomBoolean(properties.csharp_new_line_before_else, true),
        beforeCatch: resolveCustomBoolean(properties.csharp_new_line_before_catch, true),
        beforeFinally: resolveCustomBoolean(properties.csharp_new_line_before_finally, true),
    };
}

export function resolveCSharpSpacingOptions(properties: Readonly<Props>): CSharpSpacingOptions {
    return {
        afterControlFlowKeyword: resolveCustomBoolean(properties.csharp_space_after_keywords_in_control_flow_statements, true),
        aroundBinaryOperators: resolveBinaryOperatorSpacing(properties.csharp_space_around_binary_operators),
        afterComma: resolveCustomBoolean(properties.csharp_space_after_comma, true),
        beforeComma: resolveCustomBoolean(properties.csharp_space_before_comma, false),
        afterForSemicolon: resolveCustomBoolean(properties.csharp_space_after_semicolon_in_for_statement, true),
        beforeForSemicolon: resolveCustomBoolean(properties.csharp_space_before_semicolon_in_for_statement, false),
        afterCast: resolveCustomBoolean(properties.csharp_space_after_cast, false),
        beforeInheritanceColon: resolveCustomBoolean(properties.csharp_space_before_colon_in_inheritance_clause, true),
        afterInheritanceColon: resolveCustomBoolean(properties.csharp_space_after_colon_in_inheritance_clause, true),
    };
}

export function resolveCSharpWrappingOptions(properties: Readonly<Props>): CSharpWrappingOptions {
    return {
        preserveSingleLineStatements: resolveCustomBoolean(properties.csharp_preserve_single_line_statements, true),
        preserveSingleLineBlocks: resolveCustomBoolean(properties.csharp_preserve_single_line_blocks, true),
    };
}

export function resolveCSharpIndentationOptions(properties: Readonly<Props>): CSharpIndentationOptions {
    return {
        indentBlockContents: resolveCustomBoolean(properties.csharp_indent_block_contents, true),
        indentBraces: resolveCustomBoolean(properties.csharp_indent_braces, false),
        indentCaseContents: resolveCustomBoolean(properties.csharp_indent_case_contents, true),
        indentSwitchLabels: resolveCustomBoolean(properties.csharp_indent_switch_labels, true),
        indentCaseContentsWhenBlock: resolveCustomBoolean(properties.csharp_indent_case_contents_when_block, true),
        indentLabels: resolveLabelIndentation(properties.csharp_indent_labels),
    };
}

export function resolveIndentationOptions(
    properties: Readonly<Props>,
    fallback: EditorConfigFallback = {},
): IndentationOptions {
    const fallbackSize = positiveInteger(fallback.tabSize) ?? defaultIndentationOptions.size;
    const style = resolveIndentationStyle(properties.indent_style, fallback.insertSpaces);
    const configuredTabWidth = positiveInteger(properties.tab_width);
    const configuredIndentSize = positiveInteger(properties.indent_size);
    const tabWidth = configuredTabWidth ?? configuredIndentSize ?? fallbackSize;
    const size = configuredIndentSize ?? (properties.indent_size === "tab" ? tabWidth : fallbackSize);

    return { style, size, tabWidth };
}

export function resolveLineEnding(value: Props["end_of_line"], fallback: LineEnding = "\n"): LineEnding {
    if (value === "lf") {
        return "\n";
    }

    if (value === "crlf") {
        return "\r\n";
    }

    return fallback;
}

export function resolveBoolean(
    value: Props["insert_final_newline"] | Props["trim_trailing_whitespace"],
    fallback: boolean | undefined,
    defaultValue: boolean,
): boolean {
    if (value === true || value === false) {
        return value;
    }

    return fallback ?? defaultValue;
}

export function resolveCharset(value: Props["charset"], fallback: Charset | undefined): Charset {
    switch (value) {
        case "latin1":
            return "latin1";
        case "utf-16be":
            return "utf-16be";
        case "utf-16le":
            return "utf-16le";
        case "utf-8-bom":
            return "utf-8-bom";
        case "utf-8":
        default:
            return fallback ?? "utf-8";
    }
}

async function parseEditorConfig(resource: vscode.Uri): Promise<Props> {
    if (resource.scheme !== "file") {
        return {};
    }

    try {
        return await parse(resource.fsPath, { unset: true });
    } catch {
        return {};
    }
}

function resolveIndentationStyle(configuredStyle: Props["indent_style"], insertSpaces: boolean | undefined): IndentationStyle {
    if (configuredStyle === "space") {
        return "space";
    }

    if (configuredStyle === "tab") {
        return "tab";
    }

    if (insertSpaces !== undefined) {
        return insertSpaces ? "space" : "tab";
    }

    return defaultIndentationOptions.style;
}

function positiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveIntegerString(value: unknown): number | undefined {
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
        return undefined;
    }

    return positiveInteger(Number.parseInt(value, 10));
}

function resolveCustomBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === true || value === "true") {
        return true;
    }

    if (value === false || value === "false") {
        return false;
    }

    return defaultValue;
}

function resolveLabelIndentation(value: unknown): CSharpLabelIndentation {
    if (value === "flush_left" || value === "no_change") {
        return value;
    }

    return "one_less_than_current";
}

function resolveOpenBraceContexts(value: unknown): CSharpNewLineOptions["beforeOpenBrace"] {
    if (typeof value !== "string") {
        return "all";
    }

    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "all" || normalizedValue === "none") {
        return normalizedValue;
    }

    const contexts = new Set<CSharpOpenBraceContext>();
    for (const item of normalizedValue.split(",")) {
        const context = item.trim() as CSharpOpenBraceContext;
        if (csharpOpenBraceContexts.has(context)) {
            contexts.add(context);
        }
    }

    return contexts.size > 0 ? contexts : "all";
}

function resolveBinaryOperatorSpacing(value: unknown): CSharpBinaryOperatorSpacing {
    return value === "none" || value === "ignore" ? value : "before_and_after";
}
