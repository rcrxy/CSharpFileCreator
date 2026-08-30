import * as path from "node:path";
import { csharpKeywords } from "../constants/csharpKeywords";
import type { CSharpLanguageCapabilities } from "../models/csharpTemplate";
import type { ProjectContext } from "./projectContext";

/**
 * 优先根据显式 LangVersion，随后根据目标框架推导模板可用的 C# 语言能力。
 */
export function resolveCSharpCapabilities(langVersion?: string, targetFramework?: string): CSharpLanguageCapabilities {
    const majorVersion = parseLanguageMajorVersion(langVersion) ?? inferLanguageMajorVersion(targetFramework);

    return {
        supportsFileScopedNamespace: majorVersion >= 10,
        supportsRecords: majorVersion >= 9,
    };
}

/**
 * 根据项目根 namespace 与目标目录相对路径生成最终 namespace。
 */
export function resolveNamespace(
    targetDirectory: string,
    projectContext: ProjectContext | undefined,
    workspaceDirectory?: string,
): string | undefined {
    const projectFileName = projectContext
        ? path.basename(projectContext.projectPath, path.extname(projectContext.projectPath))
        : undefined;
    // 根 namespace 的 fallback 顺序与项目上下文的可靠程度保持一致。
    const rootNamespace =
        projectContext?.rootNamespace ??
        projectContext?.assemblyName ??
        projectFileName ??
        (workspaceDirectory ? path.basename(workspaceDirectory) : undefined);
    const baseDirectory = projectContext?.projectDirectory ?? workspaceDirectory;

    if (!rootNamespace || !baseDirectory) {
        return undefined;
    }

    const relativeDirectory = path.relative(baseDirectory, targetDirectory);
    if (relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
        // 目标不在项目或工作区内时不拼接相对路径，避免产生带上级目录语义的 namespace。
        return sanitizeNamespace(rootNamespace);
    }

    const namespaceParts = [rootNamespace, ...relativeDirectory.split(path.sep)]
        .flatMap(part => part.split("."))
        .map(sanitizeIdentifier)
        .filter(part => part.length > 0);

    return namespaceParts.length > 0 ? namespaceParts.join(".") : undefined;
}

/**
 * 将点分隔文本转换为合法的 C# namespace。
 */
export function sanitizeNamespace(value: string): string | undefined {
    const parts = value
        .split(".")
        .map(sanitizeIdentifier)
        .filter(part => part.length > 0);

    return parts.length > 0 ? parts.join(".") : undefined;
}

/**
 * 将显式 C# 语言版本解析为主版本号。
 */
function parseLanguageMajorVersion(langVersion?: string): number | undefined {
    if (!langVersion) {
        return undefined;
    }

    const normalizedVersion = langVersion.trim().toLowerCase();
    if (["latest", "latestmajor", "preview"].includes(normalizedVersion)) {
        return Number.POSITIVE_INFINITY;
    }

    const match = /^(\d+)(?:\.\d+)?$/.exec(normalizedVersion);
    return match ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * 在缺少 LangVersion 时，根据目标框架采用对应 SDK 的默认 C# 版本。
 */
function inferLanguageMajorVersion(targetFramework?: string): number {
    const normalizedFramework = targetFramework?.trim().toLowerCase();
    if (!normalizedFramework) {
        return 9;
    }

    const modernNetMatch = /^net(\d+)(?:\.\d+)?(?:-|$)/.exec(normalizedFramework);
    if (modernNetMatch) {
        const netMajorVersion = Number.parseInt(modernNetMatch[1], 10);
        if (netMajorVersion >= 5) {
            return netMajorVersion + 4;
        }
    }

    if (/^netcoreapp3(?:\.\d+)?(?:-|$)/.test(normalizedFramework) || /^netstandard2\.1(?:-|$)/.test(normalizedFramework)) {
        return 8;
    }

    return 7;
}

/**
 * 清理 namespace 片段，并处理数字开头和 C# 关键字。
 */
function sanitizeIdentifier(value: string): string {
    const sanitizedValue = value.trim().replace(/[^\p{L}\p{Nl}\p{Nd}\p{Pc}\p{Mn}\p{Mc}\p{Cf}]/gu, "_");
    if (!sanitizedValue) {
        return "";
    }

    const startsWithDigit = /^\p{Nd}/u.test(sanitizedValue);
    const identifier = startsWithDigit ? `_${sanitizedValue}` : sanitizedValue;
    return csharpKeywords.has(identifier) ? `@${identifier}` : identifier;
}