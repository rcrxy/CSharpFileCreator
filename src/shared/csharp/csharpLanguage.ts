export interface CSharpLanguageCapabilities {
    readonly supportsFileScopedNamespace: boolean;
    readonly supportsRecords: boolean;
}

/**
 * 优先根据显式 LangVersion，随后根据目标框架推导可用的 C# 语言能力。
 */
export function resolveCSharpCapabilities(langVersion?: string, targetFramework?: string): CSharpLanguageCapabilities {
    const majorVersion = parseLanguageMajorVersion(langVersion) ?? inferLanguageMajorVersion(targetFramework);

    return {
        supportsFileScopedNamespace: majorVersion >= 10,
        supportsRecords: majorVersion >= 9,
    };
}

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
