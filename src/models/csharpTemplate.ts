export type CSharpTemplateKind = "class" | "interface" | "record" | "struct" | "enum" | "abstractClass" | "staticClass";

export interface CSharpTemplateOption {
    readonly label: string;
    readonly description: string;
    readonly templateKind: CSharpTemplateKind;
}

export interface CSharpLanguageCapabilities {
    readonly supportsFileScopedNamespace: boolean;
    readonly supportsRecords: boolean;
}

export interface CSharpTemplateContext {
    readonly kind: CSharpTemplateKind;
    readonly typeName: string;
    readonly namespaceName?: string;
    readonly capabilities: CSharpLanguageCapabilities;
}

export const csharpTemplateOptions: readonly CSharpTemplateOption[] = [
    { label: "Class", description: "public class", templateKind: "class" },
    { label: "Interface", description: "public interface", templateKind: "interface" },
    { label: "Record", description: "public record", templateKind: "record" },
    { label: "Struct", description: "public struct", templateKind: "struct" },
    { label: "Enum", description: "public enum", templateKind: "enum" },
    { label: "Abstract Class", description: "public abstract class", templateKind: "abstractClass" },
    { label: "Static Class", description: "public static class", templateKind: "staticClass" },
];