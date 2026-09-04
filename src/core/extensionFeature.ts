import type * as vscode from "vscode";

export type ExtensionFeature = (context: vscode.ExtensionContext) => void | Promise<void>;
