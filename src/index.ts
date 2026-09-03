import * as vscode from "vscode";
import type { ExtensionFeature } from "./core/extensionFeature";
import { registerFileCreationFeature } from "./features/fileCreation";
import { registerFormattingFeature } from "./features/formatting";

const features: readonly ExtensionFeature[] = [registerFileCreationFeature, registerFormattingFeature];

/**
 * 激活扩展，并依次注册各个独立功能模块。
 */
export function activate(context: vscode.ExtensionContext) {
    for (const registerFeature of features) {
        registerFeature(context);
    }
}

/**
 * 扩展停用入口。当前资源均由 subscriptions 自动释放，无需额外清理。
 */
export function deactivate() {}
