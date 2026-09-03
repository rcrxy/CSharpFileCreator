import type { CSharpTemplateContext, CSharpTemplateKind } from "../models/csharpTemplate";

export function renderCSharpTemplate(context: CSharpTemplateContext): string {
    const declaration = renderDeclaration(context.kind, context.typeName);
    const namespaceName = context.namespaceName;

    if (!namespaceName) {
        return `${declaration}\n`;
    }

    if (context.capabilities.supportsFileScopedNamespace) {
        return `namespace ${namespaceName};\n\n${declaration}\n`;
    }

    const indentedDeclaration = declaration
        .split("\n")
        .map(line => `    ${line}`)
        .join("\n");

    return `namespace ${namespaceName}\n{\n${indentedDeclaration}\n}\n`;
}

function renderDeclaration(kind: CSharpTemplateKind, typeName: string): string {
    const keyword = getDeclarationKeyword(kind);
    return `public ${keyword} ${typeName}\n{\n}`;
}

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
