import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback } from "../../../core/editorConfig";
import {
    createCSharpFormattingOptions,
    type CSharpDocumentFormattingRequest,
    type CSharpFormattingBackend,
    type CSharpFormattingKind,
    type CSharpFormattingRequest,
    type CSharpFormattingResult,
    type CSharpRangeFormattingRequest,
    type CSharpTextSpan,
} from "../csharpFormattingBackend";

export class CSharpDocumentFormattingProvider
    implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
    constructor(
        private readonly log: vscode.LogOutputChannel,
        private readonly backend: CSharpFormattingBackend,
    ) {}

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
        return this.provideEdits(document, expandToFullLines(document, range), options, token, "range");
    }

    private async provideEdits(
        document: vscode.TextDocument,
        targetRange: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
        kind: Exclude<CSharpFormattingKind, "snippet">,
    ): Promise<vscode.TextEdit[]> {
        const startedAt = performance.now();
        try {
            const editorConfig = await resolveEditorConfig(document.uri, getEditorConfigFallback(document, options));
            if (token.isCancellationRequested) {
                this.log.info(`C# ${kind} formatting cancelled: ${document.uri.toString()}.`);
                return [];
            }

            const source = document.getText();
            const originalSelection = document.getText(targetRange);
            const formattingOptions = createCSharpFormattingOptions(editorConfig);
            const request: CSharpDocumentFormattingRequest | CSharpRangeFormattingRequest =
                kind === "document"
                    ? { source, kind, options: formattingOptions }
                    : { source, kind, span: toTextSpan(document, targetRange), options: formattingOptions };
            const result = await this.formatWithCancellation(token, request);
            if (token.isCancellationRequested) {
                this.log.info(`C# ${kind} formatting cancelled: ${document.uri.toString()}.`);
                return [];
            }

            const targetSpan = toTextSpan(document, targetRange);
            const edits = result.changes.map(change => {
                validateChangeSpan(source.length, targetSpan, change.span);
                return vscode.TextEdit.replace(toRange(document, change.span), change.newText);
            });

            this.log.info(
                `C# ${kind} formatting completed: ${document.uri.toString()} ` +
                    `(backend=${this.backend.kind}, changed=${edits.length > 0}, duration=${formatElapsedTime(startedAt)}, ` +
                    `range=${formatRange(targetRange)}, inputChars=${originalSelection.length}, ` +
                    `outputChars=${calculateOutputLength(originalSelection.length, result)}).`,
            );

            return edits;
        } catch (error) {
            if (token.isCancellationRequested) {
                this.log.info(`C# ${kind} formatting cancelled: ${document.uri.toString()}.`);
                return [];
            }

            this.log.error(`C# ${kind} formatting failed: ${document.uri.toString()}.`, error);
            throw error;
        }
    }

    private async formatWithCancellation(
        token: vscode.CancellationToken,
        request: CSharpFormattingRequest,
    ): Promise<CSharpFormattingResult> {
        const controller = new AbortController();
        const cancellationSubscription = token.onCancellationRequested(() => controller.abort());

        try {
            return await this.backend.format({ ...request, signal: controller.signal });
        } finally {
            cancellationSubscription.dispose();
        }
    }
}

function toTextSpan(document: vscode.TextDocument, range: vscode.Range): CSharpTextSpan {
    const start = document.offsetAt(range.start);
    return { start, length: document.offsetAt(range.end) - start };
}

function toRange(document: vscode.TextDocument, span: CSharpTextSpan): vscode.Range {
    return new vscode.Range(document.positionAt(span.start), document.positionAt(span.start + span.length));
}

function validateChangeSpan(sourceLength: number, targetSpan: CSharpTextSpan, changeSpan: CSharpTextSpan): void {
    const targetEnd = targetSpan.start + targetSpan.length;
    const changeEnd = changeSpan.start + changeSpan.length;
    if (changeSpan.start < targetSpan.start || changeSpan.length < 0 || changeEnd > targetEnd || changeEnd > sourceLength) {
        throw new RangeError("C# formatting backend returned a text change outside the requested span.");
    }
}

function calculateOutputLength(inputLength: number, result: CSharpFormattingResult): number {
    return result.changes.reduce((length, change) => length - change.span.length + change.newText.length, inputLength);
}

function formatRange(range: vscode.Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function formatElapsedTime(startedAt: number): string {
    return `${(performance.now() - startedAt).toFixed(1)} ms`;
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
        profileFileName: "document.cs",
        lineEnding: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
    };
}
