import { Buffer } from "node:buffer";
import * as path from "node:path";
import { parseFromFiles, type Props } from "editorconfig";
import type * as vscode from "vscode";

export const defaultProfilePath = ["src", "core", "editorConfig", "profiles", "default.editorconfig"] as const;
const syntheticRoot = path.resolve(path.parse(process.cwd()).root, "csharp-workbench-default-profile");
let profileContents: Buffer | undefined;

export function initializeDefaultEditorConfigProfile(contents: Uint8Array): void {
    profileContents = Buffer.from(contents);
}

export async function resolveDefaultEditorConfigProfile(resource: vscode.Uri, fallbackFileName?: string): Promise<Props> {
    if (!profileContents) {
        return {};
    }

    const resourceFileName = path.basename(resource.path || resource.fsPath);
    const fileName = path.extname(resourceFileName) ? resourceFileName : (fallbackFileName ?? resourceFileName ?? "document");
    const targetPath = path.join(syntheticRoot, fileName);
    const configPath = path.join(syntheticRoot, ".editorconfig");
    return parseFromFiles(targetPath, Promise.resolve([{ name: configPath, contents: profileContents }]), { unset: true });
}
