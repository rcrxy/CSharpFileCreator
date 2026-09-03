import * as vscode from "vscode";

export interface FileContent {
    readonly fileName: string;
    readonly content: string;
}

export async function findExistingFile(directoryUri: vscode.Uri, files: readonly FileContent[]): Promise<string | undefined> {
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
 * 在同一个 WorkspaceEdit 中创建关联文件，并打开主文件。
 */
export async function createFiles(
    directoryUri: vscode.Uri,
    files: readonly FileContent[],
    primaryFileName: string,
): Promise<void> {
    await vscode.workspace.fs.createDirectory(directoryUri);

    const edit = new vscode.WorkspaceEdit();
    for (const file of files) {
        edit.createFile(vscode.Uri.joinPath(directoryUri, file.fileName), {
            contents: new TextEncoder().encode(file.content),
            overwrite: false,
        });
    }

    if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error("VS Code could not apply the file creation edit.");
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(directoryUri, primaryFileName));
    await vscode.window.showTextDocument(document);
}
