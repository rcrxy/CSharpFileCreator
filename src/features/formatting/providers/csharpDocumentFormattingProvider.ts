import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback, type WorkbenchEditorConfig } from "../../../core/editorConfig";
import type { CSharpCodeFormatter } from "../csharpCodeFormatter";
import { formatCSharpCodeStyle, wrapCSharpLines } from "../services/csharpCodeStyleFormatter";
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
        const codeStyleFormatted = this.formatCodeStyle(source, editorConfig);

        const indented = formatCSharpIndentation(codeStyleFormatted, {
            indentation: editorConfig.indentation,
            csharpIndentation: editorConfig.csharpIndentation,
        });

        return wrapCSharpLines(indented, editorConfig.maxLineLength, editorConfig.indentation);
    }

    private formatCodeStyle(source: string, editorConfig: WorkbenchEditorConfig): string {
        return formatCSharpCodeStyle(source, {
            indentation: editorConfig.indentation,
            newLines: editorConfig.csharpNewLines,
            spacing: editorConfig.csharpSpacing,
            wrapping: editorConfig.csharpWrapping,
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
        const originalSelection = document.getText(targetRange);
        const formattedSelection =
            kind === "document"
                ? formatDocumentText(this.formatText(source, editorConfig), editorConfig)
                : formatSelectedText(
                      this.formatSelection(document, targetRange, source, editorConfig),
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

    private formatSelection(
        document: vscode.TextDocument,
        targetRange: vscode.Range,
        source: string,
        editorConfig: WorkbenchEditorConfig,
    ): string {
        const selectedSource = document.getText(targetRange);
        const codeStyleFormatted = this.formatCodeStyle(selectedSource, editorConfig);
        const prefix = source.slice(0, document.offsetAt(targetRange.start));
        const contextualFormatted = formatCSharpIndentation(prefix + codeStyleFormatted, {
            indentation: editorConfig.indentation,
            csharpIndentation: editorConfig.csharpIndentation,
        });
        const lineEnding = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";

        const selectedFormatted = contextualFormatted
            .split(/\r\n|\n|\r/)
            .slice(targetRange.start.line)
            .join(lineEnding);

        return wrapCSharpLines(selectedFormatted, editorConfig.maxLineLength, editorConfig.indentation);
    }
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
    return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function expandToFullLines(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
    const lastLine = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
    return new vscode.Range(range.start.line, 0, lastLine, document.lineAt(lastLine).text.length);
}

function getEditorConfigFallback(document: vscode.TextDocument, options: vscode.FormattingOptions): EditorConfigFallback {
    return {
        insertSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        maxLineLength: vscode.workspace.getConfiguration("editor", document.uri).get<number>("wordWrapColumn"),
        lineEnding: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
    };
}
