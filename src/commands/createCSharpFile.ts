import * as path from "node:path";
import * as vscode from "vscode";
import { invalidTypeNames } from "../constants/invalidTypeNames";
import type { CSharpTemplateOption } from "../models/csharpTemplate";
import { renderCSharpTemplate } from "../renderers/csharpTemplateRenderer";
import { resolveCSharpCapabilities, resolveNamespace } from "../resolvers/csharpContext";
import { resolveProjectContext } from "../resolvers/projectContext";

export interface ResolvedTargetPath {
    readonly relativeDirectory: string;
    readonly typeName: string;
    readonly fileName: string;
}

/**
 * 根据用户选择的模板，在 Explorer 目标目录中创建并打开 C# 文件。
 */
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

    // 输入可以包含相对目录，最终目录同时用于文件创建和 namespace 推导。
    const parsedTargetPath = parseTargetInput(input);
    const targetPath = template.templateKind === "interface" ? addInterfacePrefix(parsedTargetPath) : parsedTargetPath;
    const finalDirectoryUri = targetPath.relativeDirectory
        ? vscode.Uri.joinPath(targetDirectoryUri, ...targetPath.relativeDirectory.split("/"))
        : targetDirectoryUri;
    const fileUri = vscode.Uri.joinPath(finalDirectoryUri, targetPath.fileName);

    if (await uriExists(fileUri)) {
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
        // createDirectory 可递归创建缺失目录，并允许目标目录已经存在。
        await vscode.workspace.fs.createDirectory(finalDirectoryUri);

        const edit = new vscode.WorkspaceEdit();
        // 即使检查文件存在后发生并发写入，overwrite: false 仍可避免静默覆盖。
        edit.createFile(fileUri, {
            contents: new TextEncoder().encode(content),
            overwrite: false,
        });

        if (!(await vscode.workspace.applyEdit(edit))) {
            throw new Error("VS Code could not apply the file creation edit.");
        }

        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not create ${targetPath.fileName}: ${message}`);
    }
}

/**
 * 将路径解析异常转换为 Input Box 可展示的校验消息。
 */
export function validateTargetInput(value: string): string | undefined {
    try {
        parseTargetInput(value);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/**
 * 解析“相对目录 + 类型名”输入，并生成规范化的 .cs 文件路径信息。
 */
export function parseTargetInput(value: string): ResolvedTargetPath {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (!normalizedValue) {
        throw new Error("Enter a type name.");
    }

    // 禁止绝对路径与路径穿越，确保文件只能创建在用户选择的目录下。
    if (normalizedValue.startsWith("/") || /^[a-zA-Z]:\//.test(normalizedValue)) {
        throw new Error("Use a relative path.");
    }

    const segments = normalizedValue.split("/");
    if (segments.some(segment => !segment || segment === "." || segment === "..")) {
        throw new Error("The relative path contains an invalid segment.");
    }

    const inputName = segments.pop();
    const typeName = inputName?.toLowerCase().endsWith(".cs") ? inputName.slice(0, -3) : inputName;
    if (!typeName || !isValidTypeName(typeName)) {
        throw new Error("Enter a valid C# type name.");
    }

    if (segments.some(segment => /[<>:"|?*]/.test(segment))) {
        throw new Error("The relative path contains invalid characters.");
    }

    return {
        relativeDirectory: segments.join("/"),
        typeName,
        fileName: `${typeName}.cs`,
    };
}

/**
 * 为接口类型名和文件名添加 I 前缀，已符合接口命名约定时不重复添加。
 */
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

/**
 * 按 Explorer 选择、当前编辑器目录、首个工作区目录的顺序确定创建位置。
 */
function resolveTargetDirectory(selectedUri?: vscode.Uri): vscode.Uri | undefined {
    if (selectedUri) {
        return selectedUri;
    }

    if (vscode.window.activeTextEditor) {
        return vscode.Uri.file(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath));
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * 判断目标 URI 是否已经存在。
 */
async function uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/**
 * 校验类型名是否符合 C# 标识符规则，并排除不能直接作为类型名的关键字。
 */
function isValidTypeName(value: string): boolean {
    return !invalidTypeNames.has(value) && /^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Nd}\p{Pc}\p{Mn}\p{Mc}\p{Cf}]*$/u.test(value);
}
