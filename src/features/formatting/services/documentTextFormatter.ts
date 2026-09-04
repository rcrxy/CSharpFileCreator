import type { Charset, LineEnding } from "../../../core/editorConfig";

export interface DocumentTextFormattingOptions {
    readonly lineEnding: LineEnding;
    readonly insertFinalNewline: boolean;
    readonly trimTrailingWhitespace: boolean;
    readonly charset: Charset;
}

/**
 * 应用与具体语言无关的 EditorConfig 文件级文本规则。
 */
export function formatDocumentText(source: string, options: DocumentTextFormattingOptions): string {
    const withoutBom = source.startsWith("\uFEFF") ? source.slice(1) : source;
    const normalized = withoutBom.replace(/\r\n|\n|\r/g, options.lineEnding);
    const withoutTrailingWhitespace = options.trimTrailingWhitespace ? trimTrailingWhitespace(normalized) : normalized;
    const withFinalNewline = options.insertFinalNewline
        ? ensureFinalNewline(withoutTrailingWhitespace, options.lineEnding)
        : removeFinalNewlines(withoutTrailingWhitespace);

    return options.charset === "utf-8-bom" ? `\uFEFF${withFinalNewline}` : withFinalNewline;
}

/**
 * 选区格式化只清理选区中的尾随空白，不修改文件级 EOL、最终换行或 BOM。
 */
export function formatSelectedText(source: string, trimWhitespace: boolean): string {
    return trimWhitespace ? trimTrailingWhitespace(source) : source;
}

function trimTrailingWhitespace(source: string): string {
    return source.replace(/[ \t]+(?=\r\n|\n|\r|$)/g, "");
}

function ensureFinalNewline(source: string, lineEnding: LineEnding): string {
    return `${removeFinalNewlines(source)}${lineEnding}`;
}

function removeFinalNewlines(source: string): string {
    return source.replace(/(?:\r\n|\n|\r)+$/g, "");
}
