import * as vscode from "vscode";
import { resolveCSharpCapabilities } from "../../../shared/csharp/csharpLanguage";
import { resolveNamespace } from "../../../shared/csharp/csharpNamespace";
import { resolveProjectContext } from "../../../shared/csharp/projectContext";
import type { CSharpTemplateOption } from "../models/csharpTemplate";
import { renderCSharpTemplate } from "../renderers/csharpTemplateRenderer";
import { parseTargetInput, resolveTargetDirectory, validateTargetInput, type ResolvedTargetPath } from "../services/fileTarget";
import { createFiles, findExistingFile, type FileContent } from "../services/fileWriter";

export async function createCSharpFile(template: CSharpTemplateOption, selectedUri?: vscode.Uri): Promise<void> {
    const targetDirectoryUri = resolveTargetDirectory(selectedUri);
    if (!targetDirectoryUri) {
        void vscode.window.showErrorMessage("Open a workspace folder before creating a C# file.");
        return;
    }

    if (targetDirectoryUri.scheme !== "file") {
        void vscode.window.showErrorMessage("C# file creation currently requires a local workspace folder.");
        return;
    }

    const input = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "Services/Orders/OrderService",
        prompt: "Enter a type name or relative path",
        title: `New C# ${template.label}`,
        validateInput: value => validateTargetInput(value),
    });
    if (!input) {
        return;
    }

    const parsedTargetPath = parseTargetInput(input);
    const targetPath = template.templateKind === "interface" ? addInterfacePrefix(parsedTargetPath) : parsedTargetPath;
    const finalDirectoryUri = targetPath.relativeDirectory
        ? vscode.Uri.joinPath(targetDirectoryUri, ...targetPath.relativeDirectory.split("/"))
        : targetDirectoryUri;
    const files: readonly FileContent[] = [{ fileName: targetPath.fileName, content: "" }];

    if (await findExistingFile(finalDirectoryUri, files)) {
        void vscode.window.showErrorMessage(`${targetPath.fileName} already exists.`);
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetDirectoryUri);
    const projectContext = await resolveProjectContext(targetDirectoryUri.fsPath);
    const capabilities = resolveCSharpCapabilities(projectContext?.langVersion, projectContext?.targetFramework);

    if (template.templateKind === "record" && !capabilities.supportsRecords) {
        void vscode.window.showErrorMessage("Records require C# 9 or later in the target project.");
        return;
    }

    const namespaceName = resolveNamespace(finalDirectoryUri.fsPath, projectContext, workspaceFolder?.uri.fsPath);
    const content = renderCSharpTemplate({
        kind: template.templateKind,
        typeName: targetPath.typeName,
        namespaceName,
        capabilities,
    });

    try {
        await createFiles(finalDirectoryUri, [{ fileName: targetPath.fileName, content }], targetPath.fileName);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not create ${targetPath.fileName}: ${message}`);
    }
}

function addInterfacePrefix(targetPath: ResolvedTargetPath): ResolvedTargetPath {
    const hasInterfacePrefix = /^I(?:\p{Lu}|\p{Lo}|\p{Nd}|_)/u.test(targetPath.typeName);
    if (hasInterfacePrefix) {
        return targetPath;
    }

    const typeName = `I${targetPath.typeName}`;
    return {
        ...targetPath,
        typeName,
        fileName: `${typeName}.cs`,
    };
}
