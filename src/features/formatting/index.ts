import * as vscode from "vscode";
import { RazorDocumentFormattingProvider } from "./providers/razorDocumentFormattingProvider";

export function registerFormattingFeature(context: vscode.ExtensionContext): void {
    const log = vscode.window.createOutputChannel("C# Workbench", { log: true });
    const razorFormattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        [{ language: "aspnetcorerazor" }, { language: "razor" }],
        new RazorDocumentFormattingProvider(log),
    );

    log.info("Formatting feature registered for ASP.NET Razor, Razor, and C# documents.");
    context.subscriptions.push(log, razorFormattingProvider);
}
