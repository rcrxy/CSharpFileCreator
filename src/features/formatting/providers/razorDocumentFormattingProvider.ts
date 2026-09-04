import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback } from "../../../core/editorConfig";
import type { CSharpCodeFormatter } from "../csharpCodeFormatter";
import { formatRazorMarkup } from "../services/razorMarkupFormatter";

export class RazorDocumentFormattingProvider
    implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
    constructor(
        private readonly log: vscode.LogOutputChannel,
        private readonly csharpFormatter?: CSharpCodeFormatter,
    ) {}

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return this.provideFullDocumentFormattingEdits(document, options, token, "document");
    }

    async provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return this.provideFullDocumentFormattingEdits(document, options, token, "range", formatRange(range));
    }

    async provideDocumentRangesFormattingEdits(
        document: vscode.TextDocument,
        ranges: vscode.Range[],
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return this.provideFullDocumentFormattingEdits(
            document,
            options,
            token,
            "ranges",
            `count=${ranges.length}`,
        );
    }

    private async provideFullDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
        trigger: "document" | "range" | "ranges",
        requestedRanges?: string,
    ): Promise<vscode.TextEdit[]> {
        const startedAt = performance.now();

        try {
            const editorConfig = await resolveEditorConfig(document.uri, getIndentationFallback(document, options));
            if (token.isCancellationRequested) {
                this.log.info(`Razor formatting cancelled: ${document.uri.toString()} (trigger=${trigger}).`);
                return [];
            }

            const source = document.getText();
            const formatted = formatRazorMarkup(source, {
                indentation: editorConfig.html.indentation,
                csharpIndentation: editorConfig.csharpIndentation,
                csharpNewLines: editorConfig.csharpNewLines,
                html: editorConfig.html,
                lineEnding: editorConfig.lineEnding,
                insertFinalNewline: editorConfig.insertFinalNewline,
                trimTrailingWhitespace: editorConfig.trimTrailingWhitespace,
                charset: editorConfig.charset,
                formatCSharp: this.csharpFormatter
                    ? csharpSource => this.csharpFormatter!.formatText(csharpSource, editorConfig)
                    : undefined,
            });
            const changed = formatted !== source;

            this.log.info(
                `Razor formatting completed: ${document.uri.toString()} ` +
                    `(trigger=${trigger}, changed=${changed}, duration=${formatElapsedTime(startedAt)}, ` +
                    `inputChars=${source.length}, outputChars=${formatted.length}` +
                    `${requestedRanges ? `, request=${requestedRanges}` : ""}).`,
            );

            if (!changed) {
                return [];
            }

            const documentRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
            return [vscode.TextEdit.replace(documentRange, formatted)];
        } catch (error) {
            this.log.error(`Razor formatting failed: ${document.uri.toString()} (trigger=${trigger}).`, error);
            throw error;
        }
    }
}

function formatRange(range: vscode.Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function formatElapsedTime(startedAt: number): string {
    return `${(performance.now() - startedAt).toFixed(1)} ms`;
}

function getIndentationFallback(document: vscode.TextDocument, options: vscode.FormattingOptions): EditorConfigFallback {
    const editor = vscode.window.visibleTextEditors.find(candidate => {
        return candidate.document.uri.toString() === document.uri.toString();
    });
    const editorTabSize = editor?.options.tabSize;
    const editorInsertSpaces = editor?.options.insertSpaces;

    return {
        insertSpaces: typeof editorInsertSpaces === "boolean" ? editorInsertSpaces : options.insertSpaces,
        tabSize: typeof editorTabSize === "number" ? editorTabSize : options.tabSize,
        maxLineLength: vscode.workspace.getConfiguration("editor", document.uri).get<number>("wordWrapColumn"),
        profileFileName: "document.razor",
        lineEnding: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
        insertFinalNewline: true,
        trimTrailingWhitespace: false,
    };
}
