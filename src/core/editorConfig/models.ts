import type { Props } from "editorconfig";

export type IndentationStyle = "space" | "tab";

export interface IndentationOptions {
    readonly style: IndentationStyle;
    readonly size: number;
    readonly tabWidth: number;
}

export interface EditorConfigFallback {
    readonly insertSpaces?: boolean;
    readonly tabSize?: number;
}

export interface WorkbenchEditorConfig {
    readonly indentation: IndentationOptions;
    readonly properties: Readonly<Props>;
}
