import * as path from "node:path";
import * as vscode from "vscode";
import { csharpKeywords } from "../../../shared/csharp/csharpKeywords";

export interface ResolvedTargetPath {
    readonly relativeDirectory: string;
    readonly typeName: string;
    readonly fileName: string;
}

export function resolveTargetDirectory(selectedUri?: vscode.Uri): vscode.Uri | undefined {
    if (selectedUri) {
        return selectedUri;
    }

    if (vscode.window.activeTextEditor) {
        return vscode.Uri.file(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath));
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

export function validateTargetInput(value: string): string | undefined {
    try {
        parseTargetInput(value);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

export function parseTargetInput(value: string): ResolvedTargetPath {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (!normalizedValue) {
        throw new Error("Enter a type name.");
    }

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

function isValidTypeName(value: string): boolean {
    return !csharpKeywords.has(value) && /^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Nd}\p{Pc}\p{Mn}\p{Mc}\p{Cf}]*$/u.test(value);
}
