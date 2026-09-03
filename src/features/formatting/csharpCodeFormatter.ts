import type { WorkbenchEditorConfig } from "../../core/editorConfig";

export interface CSharpCodeFormatter {
    formatText(source: string, editorConfig: WorkbenchEditorConfig): string;
}
