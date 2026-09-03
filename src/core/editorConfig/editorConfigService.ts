import { parse, type Props } from "editorconfig";
import type * as vscode from "vscode";
import { defaultIndentationOptions } from "./defaults";
import type {
    Charset,
    CSharpIndentationOptions,
    CSharpLabelIndentation,
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
        lineEnding: resolveLineEnding(properties.end_of_line, fallback.lineEnding),
        insertFinalNewline: resolveBoolean(properties.insert_final_newline, fallback.insertFinalNewline, true),
        trimTrailingWhitespace: resolveBoolean(properties.trim_trailing_whitespace, fallback.trimTrailingWhitespace, false),
        charset: resolveCharset(properties.charset, fallback.charset),
        properties,
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
