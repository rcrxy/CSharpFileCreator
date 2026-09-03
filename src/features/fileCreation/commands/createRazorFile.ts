import * as path from "node:path";
import * as vscode from "vscode";
import { resolveCSharpCapabilities } from "../../../shared/csharp/csharpLanguage";
import { resolveNamespace } from "../../../shared/csharp/csharpNamespace";
import { resolveProjectContext } from "../../../shared/csharp/projectContext";
import type { RazorTemplateOption } from "../models/razorTemplate";
import { parseTargetInput, resolveTargetDirectory, validateTargetInput } from "../services/fileTarget";
import { createFiles, findExistingFile, type FileContent } from "../services/fileWriter";

const razorTemplateDirectory = ["src", "features", "fileCreation", "templates", "razor"] as const;

export async function createRazorFile(
    template: RazorTemplateOption,
    extensionUri: vscode.Uri,
    selectedUri?: vscode.Uri,
): Promise<void> {
    const targetDirectoryUri = resolveTargetDirectory(selectedUri);
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
        validateInput: value => validateTargetInput(stripRazorExtension(value)),
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
        await createFiles(finalDirectoryUri, files, `${componentName}.razor`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not create Razor component: ${message}`);
    }
}

async function renderRazorFiles(
    template: RazorTemplateOption,
    extensionUri: vscode.Uri,
    componentName: string,
    namespaceName: string,
    pageName: string,
    supportsFileScopedNamespace: boolean,
): Promise<readonly FileContent[]> {
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

    const templateFiles = ["component.razor", "component.razor.cs.template", "component.razor.css.template"] as const;
    const contents = await Promise.all(templateFiles.map(fileName => readRazorTemplate(extensionUri, fileName)));

    return [
        { fileName: `${componentName}.razor`, content: replacePlaceholders(contents[0], replacements) },
        { fileName: `${componentName}.razor.cs`, content: replacePlaceholders(contents[1], replacements) },
        { fileName: `${componentName}.razor.css`, content: replacePlaceholders(contents[2], replacements) },
    ];
}

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

async function readRazorTemplate(extensionUri: vscode.Uri, fileName: string): Promise<string> {
    const templateUri = vscode.Uri.joinPath(extensionUri, ...razorTemplateDirectory, fileName);
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(templateUri));
}

function replacePlaceholders(template: string, replacements: Readonly<Record<string, string>>): string {
    return Object.entries(replacements).reduce((content, [name, value]) => content.replaceAll(`{{${name}}}`, value), template);
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