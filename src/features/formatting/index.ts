import * as vscode from "vscode";
import { defaultProfilePath, initializeDefaultEditorConfigProfile } from "../../core/editorConfig/defaultProfile";
import { LightweightCSharpFormattingBackend } from "./backends/lightweightCSharpFormattingBackend";
import type { CSharpFormattingBackend } from "./csharpFormattingBackend";
import { CSharpDocumentFormattingProvider } from "./providers/csharpDocumentFormattingProvider";
import { RazorDocumentFormattingProvider } from "./providers/razorDocumentFormattingProvider";

export async function registerFormattingFeature(
    context: vscode.ExtensionContext,
    csharpBackend?: CSharpFormattingBackend,
): Promise<void> {
    const defaultProfileUri = vscode.Uri.joinPath(context.extensionUri, ...defaultProfilePath);
    initializeDefaultEditorConfigProfile(await vscode.workspace.fs.readFile(defaultProfileUri));
    const log = vscode.window.createOutputChannel("C# Workbench", { log: true });
    const backend = csharpBackend ?? new LightweightCSharpFormattingBackend();
    const csharpFormatter = new CSharpDocumentFormattingProvider(log, backend);
    const razorFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
        [{ language: "aspnetcorerazor" }, { language: "razor" }],
        new RazorDocumentFormattingProvider(log, backend),
    );
    const csharpDocumentFormattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        { language: "csharp" },
        csharpFormatter,
    );
    const csharpRangeFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
        { language: "csharp" },
        csharpFormatter,
    );

    log.info(
        `Formatting feature registered for ASP.NET Razor, Razor, and C# document/selection formatting ` +
            `(C# backend=${backend.kind}).`,
    );
    context.subscriptions.push(log, razorFormattingProvider, csharpDocumentFormattingProvider, csharpRangeFormattingProvider);
}
