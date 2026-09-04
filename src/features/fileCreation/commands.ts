import type { CSharpTemplateKind } from "./models/csharpTemplate";

export const createCSharpFileCommands: Readonly<Record<CSharpTemplateKind, string>> = {
    class: "csharpworkbench.newClass",
    interface: "csharpworkbench.newInterface",
    record: "csharpworkbench.newRecord",
    struct: "csharpworkbench.newStruct",
    enum: "csharpworkbench.newEnum",
    abstractClass: "csharpworkbench.newAbstractClass",
    staticClass: "csharpworkbench.newStaticClass",
};

export const createRazorFileCommands = {
    single: "csharpworkbench.newRazorComponent",
    componentFiles: "csharpworkbench.newRazorComponentFiles",
} as const;
