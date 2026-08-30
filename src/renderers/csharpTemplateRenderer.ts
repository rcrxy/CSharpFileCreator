import type { CSharpTemplateContext, CSharpTemplateKind } from "../models/csharpTemplate";

/**
 * 根据模板类型、namespace 和语言能力渲染完整 C# 文件内容。
 */
export function renderCSharpTemplate(context: CSharpTemplateContext): string {
    const declaration = renderDeclaration(context.kind, context.typeName);
    const namespaceName = context.namespaceName;

    if (!namespaceName) {
        return `${declaration}\n`;
    }

    // C# 10 及以上优先使用文件范围 namespace，旧版本使用块范围语法。
    if (context.capabilities.supportsFileScopedNamespace) {
        return `namespace ${namespaceName};\n\n${declaration}\n`;
    }

    const indentedDeclaration = declaration
        .split("\n")
        .map(line => `    ${line}`)
        .join("\n");

    return `namespace ${namespaceName}\n{\n${indentedDeclaration}\n}\n`;
}

/**
 * 渲染不包含 namespace 的类型声明骨架。
 */
function renderDeclaration(kind: CSharpTemplateKind, typeName: string): string {
    const keyword = getDeclarationKeyword(kind);

    return `public ${keyword} ${typeName}\n{\n}`;
}

/**
 * 将模板类型映射为对应的 C# 声明关键字。
 */
function getDeclarationKeyword(kind: CSharpTemplateKind): string {
    switch (kind) {
        case "class":
            return "class";
        case "interface":
            return "interface";
        case "record":
            return "record";
        case "struct":
            return "struct";
        case "enum":
            return "enum";
        case "abstractClass":
            return "abstract class";
        case "staticClass":
            return "static class";
    }
}