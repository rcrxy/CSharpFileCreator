import type { CSharpTemplateKind } from "../models/csharpTemplate";

export const createCSharpFileSubmenu = "csharpfilecreator.newCSharpFile";
export const createRazorFileSubmenu = "csharpfilecreator.newRazorFile";

export const createCSharpFileCommands: Readonly<Record<CSharpTemplateKind, string>> = {
    class: "csharpfilecreator.newClass",
    interface: "csharpfilecreator.newInterface",
    record: "csharpfilecreator.newRecord",
    struct: "csharpfilecreator.newStruct",
    enum: "csharpfilecreator.newEnum",
    abstractClass: "csharpfilecreator.newAbstractClass",
    staticClass: "csharpfilecreator.newStaticClass",
};

export const createRazorFileCommands = {
    single: "csharpfilecreator.newRazorComponent",
    componentFiles: "csharpfilecreator.newRazorComponentFiles",
} as const;
