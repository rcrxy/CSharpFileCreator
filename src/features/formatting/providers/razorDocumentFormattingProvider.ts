import * as vscode from "vscode";
import { resolveEditorConfig, type EditorConfigFallback } from "../../../core/editorConfig";
import { formatRazorMarkup } from "../services/razorMarkupFormatter";

export class RazorDocumentFormattingProvider implements vscode.DocumentFormattingEditProvider {
    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        const editorConfig = await resolveEditorConfig(document.uri, getIndentationFallback(document, options));
        if (token.isCancellationRequested) {
            return [];
        }

        const source = document.getText();
        const formatted = formatRazorMarkup(source, editorConfig.indentation);
        if (formatted === source) {
            return [];
        }

        const documentRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
        return [vscode.TextEdit.replace(documentRange, formatted)];
    }
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
    };
}
