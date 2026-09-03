import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback, type WorkbenchEditorConfig } from "../../../core/editorConfig";
import type { CSharpCodeFormatter } from "../csharpCodeFormatter";
import { formatCSharpIndentation } from "../services/csharpIndentationFormatter";
import { formatDocumentText, formatSelectedText } from "../services/documentTextFormatter";

export class CSharpDocumentFormattingProvider
    implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider, CSharpCodeFormatter
{
    constructor(private readonly log: vscode.LogOutputChannel) {}

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return this.provideEdits(document, fullDocumentRange(document), options, token, "document");
    }

    async provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return this.provideEdits(document, expandToFullLines(document, range), options, token, "selection");
    }

    formatText(source: string, editorConfig: WorkbenchEditorConfig): string {
        return formatCSharpIndentation(source, {
            indentation: editorConfig.indentation,
            csharpIndentation: editorConfig.csharpIndentation,
        });
    }

    private async provideEdits(
        document: vscode.TextDocument,
        targetRange: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
        kind: "document" | "selection",
    ): Promise<vscode.TextEdit[]> {
        const startedAt = performance.now();
        const editorConfig = await resolveEditorConfig(document.uri, getEditorConfigFallback(document, options));
        if (token.isCancellationRequested) {
            return [];
        }

        const source = document.getText();
        const formatted = this.formatText(source, editorConfig);
        const originalSelection = document.getText(targetRange);
        const formattedSelection =
            kind === "document"
                ? formatDocumentText(formatted, editorConfig)
                : formatSelectedText(
                      getFormattedRangeText(document, formatted, targetRange),
                      editorConfig.trimTrailingWhitespace,
                  );
        const changed = originalSelection !== formattedSelection;

        this.log.info(
            `C# ${kind} formatting completed in ${(performance.now() - startedAt).toFixed(1)} ms ` +
                `(changed=${changed}, range=${targetRange.start.line}:${targetRange.start.character}-${targetRange.end.line}:${targetRange.end.character}).`,
        );
        this.log.info(`C# formatted ${kind} result for ${document.uri.toString()}:\n${formattedSelection}`);

        return changed ? [vscode.TextEdit.replace(targetRange, formattedSelection)] : [];
    }
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
    return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function expandToFullLines(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
    const lastLine = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
    return new vscode.Range(range.start.line, 0, lastLine, document.lineAt(lastLine).text.length);
}

function getFormattedRangeText(document: vscode.TextDocument, formatted: string, range: vscode.Range): string {
    const lines = formatted.split(/\r\n|\n|\r/);
    const lineEnding = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    return lines.slice(range.start.line, range.end.line + 1).join(lineEnding);
}

function getEditorConfigFallback(document: vscode.TextDocument, options: vscode.FormattingOptions): EditorConfigFallback {
    return {
        insertSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        lineEnding: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
    };
}
