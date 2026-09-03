export type RazorTemplateKind = "single" | "componentFiles";

export interface RazorTemplateOption {
    readonly label: string;
    readonly templateKind: RazorTemplateKind;
}

export const razorTemplateOptions: readonly RazorTemplateOption[] = [
    { label: "Razor Component", templateKind: "single" },
    { label: "Razor Component with Code-Behind and CSS", templateKind: "componentFiles" },
];
