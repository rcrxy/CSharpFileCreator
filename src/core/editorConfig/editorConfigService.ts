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
        csharpIndentation: resolveCSharpIndentationOptions(properties),
        csharpNewLines: resolveCSharpNewLineOptions(properties),
        csharpSpacing: resolveCSharpSpacingOptions(properties),
        csharpWrapping: resolveCSharpWrappingOptions(properties),
        lineEnding: resolveLineEnding(properties.end_of_line, fallback.lineEnding),
        insertFinalNewline: resolveBoolean(properties.insert_final_newline, fallback.insertFinalNewline, true),
        trimTrailingWhitespace: resolveBoolean(properties.trim_trailing_whitespace, fallback.trimTrailingWhitespace, false),
        charset: resolveCharset(properties.charset, fallback.charset),
        properties,
    };
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
