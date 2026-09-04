import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback } from "../../../core/editorConfig";
import type { CSharpCodeFormatter } from "../csharpCodeFormatter";
import { formatRazorMarkup } from "../services/razorMarkupFormatter";

export class RazorDocumentFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(
        private readonly log: vscode.LogOutputChannel,
        private readonly csharpFormatter?: CSharpCodeFormatter,
    ) {}

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        const startedAt = performance.now();
        this.log.info(
            `Formatting started: ${document.uri.toString()} (language=${document.languageId}, version=${document.version}).`,
        );

        try {
            const editorConfig = await resolveEditorConfig(document.uri, getIndentationFallback(document, options));
            if (token.isCancellationRequested) {
                this.log.info(`Formatting cancelled after ${formatElapsedTime(startedAt)}.`);
                return [];
            }

            this.log.info(`Formatting configuration: ${JSON.stringify(editorConfig)}.`);

            const source = document.getText();
            const formatted = formatRazorMarkup(source, {
                indentation: editorConfig.html.indentation,
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
                `Formatting completed in ${formatElapsedTime(startedAt)} (changed=${changed}, input=${source.length} chars, output=${formatted.length} chars).`,
            );
            this.log.info(`Formatted result for ${document.uri.toString()}:\n${formatted}`);

            if (!changed) {
                return [];
            }

            const documentRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
            return [vscode.TextEdit.replace(documentRange, formatted)];
        } catch (error) {
            this.log.error(error instanceof Error ? error : String(error));
            throw error;
        }
    }
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
        lineEnding: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
        insertFinalNewline: true,
        trimTrailingWhitespace: false,
    };
}
