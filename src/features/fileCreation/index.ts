import * as vscode from "vscode";
import { createCSharpFile } from "./commands/createCSharpFile";
import { createRazorFile } from "./commands/createRazorFile";
import { createCSharpFileCommands, createRazorFileCommands } from "./commands";
import { csharpTemplateOptions } from "./models/csharpTemplate";
import { razorTemplateOptions } from "./models/razorTemplate";

export function registerFileCreationFeature(context: vscode.ExtensionContext): void {
    const createFileDisposables = csharpTemplateOptions.map(template =>
        vscode.commands.registerCommand(createCSharpFileCommands[template.templateKind], uri =>
            createCSharpFile(template, uri),
        ),
    );
    const createRazorFileDisposables = razorTemplateOptions.map(template =>
        vscode.commands.registerCommand(createRazorFileCommands[template.templateKind], uri =>
            createRazorFile(template, context.extensionUri, uri),
        ),
    );

    context.subscriptions.push(...createFileDisposables, ...createRazorFileDisposables);
}
