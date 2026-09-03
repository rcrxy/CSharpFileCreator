import * as vscode from "vscode";
import { RazorDocumentFormattingProvider } from "./providers/razorDocumentFormattingProvider";

export function registerFormattingFeature(context: vscode.ExtensionContext): void {
    const razorFormattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        { language: "razor" },
        new RazorDocumentFormattingProvider(),
    );

    context.subscriptions.push(razorFormattingProvider);
}
