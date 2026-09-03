import { parse, type Props } from "editorconfig";
import type * as vscode from "vscode";
import { defaultIndentationOptions } from "./defaults";
import type { EditorConfigFallback, IndentationOptions, IndentationStyle, WorkbenchEditorConfig } from "./models";

export async function resolveEditorConfig(
    resource: vscode.Uri,
    fallback: EditorConfigFallback = {},
): Promise<WorkbenchEditorConfig> {
    const properties = await parseEditorConfig(resource);

    return {
        indentation: resolveIndentationOptions(properties, fallback),
        properties,
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
