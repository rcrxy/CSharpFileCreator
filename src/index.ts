import * as vscode from "vscode";
import { createCSharpFile } from "./commands/createCSharpFile";
import { createRazorFile } from "./commands/createRazorFile";
import { createCSharpFileCommands, createRazorFileCommands } from "./constants/commandName";
import { csharpTemplateOptions } from "./models/csharpTemplate";
import { razorTemplateOptions } from "./models/razorTemplate";

/**
 * 激活扩展，并为每一种 C# 文件模板注册独立命令。
 */
export function activate(context: vscode.ExtensionContext) {
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

    const watcher = vscode.workspace.createFileSystemWatcher("**/*.{cs,razor,cshtml}");

    context.subscriptions.push(...createFileDisposables, ...createRazorFileDisposables, watcher);
}

/**
 * 扩展停用入口。当前资源均由 subscriptions 自动释放，无需额外清理。
 */
export function deactivate() {}
