import * as path from "node:path";
import { csharpKeywords } from "./csharpKeywords";
import type { ProjectContext } from "./projectContext";

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
        return sanitizeNamespace(rootNamespace);
    }

    const namespaceParts = [rootNamespace, ...relativeDirectory.split(path.sep)]
        .flatMap(part => part.split("."))
        .map(sanitizeIdentifier)
        .filter(part => part.length > 0);

    return namespaceParts.length > 0 ? namespaceParts.join(".") : undefined;
}

export function sanitizeNamespace(value: string): string | undefined {
    const parts = value
        .split(".")
        .map(sanitizeIdentifier)
        .filter(part => part.length > 0);

    return parts.length > 0 ? parts.join(".") : undefined;
}

function sanitizeIdentifier(value: string): string {
    const sanitizedValue = value.trim().replace(/[^\p{L}\p{Nl}\p{Nd}\p{Pc}\p{Mn}\p{Mc}\p{Cf}]/gu, "_");
    if (!sanitizedValue) {
        return "";
    }

    const startsWithDigit = /^\p{Nd}/u.test(sanitizedValue);
    const identifier = startsWithDigit ? `_${sanitizedValue}` : sanitizedValue;
    return csharpKeywords.has(identifier) ? `@${identifier}` : identifier;
}
