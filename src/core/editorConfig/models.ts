import type { Props } from "editorconfig";

export type IndentationStyle = "space" | "tab";
export type LineEnding = "\n" | "\r\n";
export type Charset = "utf-8" | "utf-8-bom" | "utf-16be" | "utf-16le" | "latin1";

export interface IndentationOptions {
    readonly style: IndentationStyle;
    readonly size: number;
    readonly tabWidth: number;
}

export type CSharpLabelIndentation = "flush_left" | "one_less_than_current" | "no_change";

export interface CSharpIndentationOptions {
    readonly indentBlockContents: boolean;
    readonly indentBraces: boolean;
    readonly indentCaseContents: boolean;
    readonly indentSwitchLabels: boolean;
    readonly indentCaseContentsWhenBlock: boolean;
    readonly indentLabels: CSharpLabelIndentation;
}

export interface EditorConfigFallback {
    readonly insertSpaces?: boolean;
    readonly tabSize?: number;
    readonly lineEnding?: LineEnding;
    readonly insertFinalNewline?: boolean;
    readonly trimTrailingWhitespace?: boolean;
    readonly charset?: Charset;
}

export interface WorkbenchEditorConfig {
    readonly indentation: IndentationOptions;
    readonly csharpIndentation: CSharpIndentationOptions;
    readonly lineEnding: LineEnding;
    readonly insertFinalNewline: boolean;
    readonly trimTrailingWhitespace: boolean;
    readonly charset: Charset;
    readonly properties: Readonly<Props>;
}
