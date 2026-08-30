import * as vscode from "vscode";
import * as path from "node:path";
import type { RazorTemplateOption } from "../models/razorTemplate";
import { resolveCSharpCapabilities, resolveNamespace } from "../resolvers/csharpContext";
import { resolveProjectContext } from "../resolvers/projectContext";
import { parseTargetInput, validateTargetInput } from "./createCSharpFile";

const razorTemplateDirectory = ["src", "templates", "razor"] as const;

interface RazorFileContent {
    readonly fileName: string;
    readonly content: string;
}

/**
 * 根据模板创建单个 Razor 文件，或创建相互关联的 Razor、代码后置和隔离样式文件。
 */
export async function createRazorFile(
    template: RazorTemplateOption,
    extensionUri: vscode.Uri,
    selectedUri?: vscode.Uri,
): Promise<void> {
    const targetDirectoryUri = selectedUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!targetDirectoryUri) {
        void vscode.window.showErrorMessage("Open a workspace folder before creating a Razor file.");
        return;
    }

    if (targetDirectoryUri.scheme !== "file") {
        void vscode.window.showErrorMessage("Razor file creation currently requires a local workspace folder.");
        return;
    }

    const input = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "Components/Module",
        prompt: "Enter a component name or relative path",
        title: `New ${template.label}`,
        validateInput: value => validateRazorTargetInput(value),
    });
    if (!input) {
        return;
    }

    const targetPath = parseTargetInput(stripRazorExtension(input));
    const componentName = targetPath.typeName;
    const finalDirectoryUri = targetPath.relativeDirectory
        ? vscode.Uri.joinPath(targetDirectoryUri, ...targetPath.relativeDirectory.split("/"))
        : targetDirectoryUri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetDirectoryUri);
    const projectContext = await resolveProjectContext(targetDirectoryUri.fsPath);
    const capabilities = resolveCSharpCapabilities(projectContext?.langVersion, projectContext?.targetFramework);
    const namespaceName =
        resolveNamespace(finalDirectoryUri.fsPath, projectContext, workspaceFolder?.uri.fsPath) ?? "Components";
    const routeBaseDirectory = projectContext?.projectDirectory ?? workspaceFolder?.uri.fsPath ?? targetDirectoryUri.fsPath;
    const pageName = resolvePageName(finalDirectoryUri.fsPath, componentName, routeBaseDirectory);
    const files = await renderRazorFiles(
        template,
        extensionUri,
        componentName,
        namespaceName,
        pageName,
        capabilities.supportsFileScopedNamespace,
    );
    const existingFile = await findExistingFile(finalDirectoryUri, files);

    if (existingFile) {
        void vscode.window.showErrorMessage(`${existingFile} already exists.`);
        return;
    }

    try {
        await vscode.workspace.fs.createDirectory(finalDirectoryUri);

        // 三个关联文件放在同一个 WorkspaceEdit 中创建，避免只生成其中一部分。
        const edit = new vscode.WorkspaceEdit();
        for (const file of files) {
            edit.createFile(vscode.Uri.joinPath(finalDirectoryUri, file.fileName), {
                contents: new TextEncoder().encode(file.content),
                overwrite: false,
            });
        }

        if (!(await vscode.workspace.applyEdit(edit))) {
            throw new Error("VS Code could not apply the Razor file creation edit.");
        }

        const razorUri = vscode.Uri.joinPath(finalDirectoryUri, `${componentName}.razor`);
        const document = await vscode.workspace.openTextDocument(razorUri);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not create Razor component: ${message}`);
    }
}

/**
 * 读取静态模板，并替换组件名、CSS 类名和代码后置声明占位符。
 */
async function renderRazorFiles(
    template: RazorTemplateOption,
    extensionUri: vscode.Uri,
    componentName: string,
    namespaceName: string,
    pageName: string,
    supportsFileScopedNamespace: boolean,
): Promise<readonly RazorFileContent[]> {
    const cssClassName = toKebabCase(componentName);
    const replacements = {
        COMPONENT_NAME: componentName,
        CSS_CLASS_NAME: cssClassName,
        PAGE_NAME: pageName,
        NAMESPACE_DIRECTIVE: `@namespace ${namespaceName}\n\n`,
        CODE_BEHIND: renderCodeBehind(componentName, namespaceName, supportsFileScopedNamespace),
    };

    if (template.templateKind === "single") {
        const content = await readRazorTemplate(extensionUri, "single.razor");
        return [{ fileName: `${componentName}.razor`, content: replacePlaceholders(content, replacements) }];
    }

    const templateFiles = ["component.razor", "component.razor.cs.template", "component.razor.css"] as const;
    const contents = await Promise.all(templateFiles.map(fileName => readRazorTemplate(extensionUri, fileName)));

    return [
        { fileName: `${componentName}.razor`, content: replacePlaceholders(contents[0], replacements) },
        { fileName: `${componentName}.razor.cs`, content: replacePlaceholders(contents[1], replacements) },
        { fileName: `${componentName}.razor.css`, content: replacePlaceholders(contents[2], replacements) },
    ];
}

/**
 * 生成与 Razor 组件同名的 partial class，确保代码后置与组件生成类合并。
 */
function renderCodeBehind(componentName: string, namespaceName: string, supportsFileScopedNamespace: boolean): string {
    const declaration = `public partial class ${componentName}\n{\n    private string Title => "${componentName}";\n}`;
    if (supportsFileScopedNamespace) {
        return `namespace ${namespaceName};\n\n${declaration}`;
    }

    const indentedDeclaration = declaration
        .split("\n")
        .map(line => `    ${line}`)
        .join("\n");
    return `namespace ${namespaceName}\n{\n${indentedDeclaration}\n}`;
}

/**
 * 根据目标文件相对项目根目录的路径生成页面路由，并移除开头的 Page/Pages/View/Views 目录。
 */
function resolvePageName(targetDirectory: string, componentName: string, baseDirectory: string): string {
    const relativeDirectory = path.relative(baseDirectory, targetDirectory);
    const directorySegments =
        relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)
            ? []
            : relativeDirectory.split(path.sep).filter(Boolean);

    while (directorySegments.length > 0 && /^(?:pages?|views?)$/i.test(directorySegments[0])) {
        directorySegments.shift();
    }

    return `/${[...directorySegments, componentName].join("/")}`;
}

/**
 * 从扩展包内读取 Razor 静态模板资源。
 */
async function readRazorTemplate(extensionUri: vscode.Uri, fileName: string): Promise<string> {
    const templateUri = vscode.Uri.joinPath(extensionUri, ...razorTemplateDirectory, fileName);
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(templateUri));
}

/**
 * 替换模板中的大写占位符。
 */
function replacePlaceholders(template: string, replacements: Readonly<Record<string, string>>): string {
    return Object.entries(replacements).reduce((content, [name, value]) => content.replaceAll(`{{${name}}}`, value), template);
}

/**
 * 在创建前检查任意一个目标文件是否存在。
 */
async function findExistingFile(directoryUri: vscode.Uri, files: readonly RazorFileContent[]): Promise<string | undefined> {
    for (const file of files) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(directoryUri, file.fileName));
            return file.fileName;
        } catch {
            // 文件不存在时继续检查下一个目标文件。
        }
    }

    return undefined;
}

/**
 * 复用 C# 类型名校验，并允许用户输入可选的 .razor 扩展名。
 */
function validateRazorTargetInput(value: string): string | undefined {
    return validateTargetInput(stripRazorExtension(value));
}

function stripRazorExtension(value: string): string {
    return value.toLowerCase().endsWith(".razor") ? value.slice(0, -6) : value;
}

function toKebabCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/_/g, "-")
        .toLowerCase();
}
