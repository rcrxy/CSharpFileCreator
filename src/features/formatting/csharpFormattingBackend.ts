import type {
    Charset,
    CSharpIndentationOptions,
    CSharpNewLineOptions,
    CSharpOpenBraceContext,
    CSharpParenthesisSpacingContext,
    CSharpSpacingOptions,
    CSharpWrappingOptions,
    IndentationOptions,
    LineEnding,
    WorkbenchEditorConfig,
} from "../../core/editorConfig";

export type CSharpFormattingBackendKind = "lightweight" | "shared-roslyn" | "standalone-roslyn";
export type CSharpFormattingKind = "document" | "range" | "snippet";
export type CSharpSnippetKind = "type-members" | "statements";

export interface CSharpTextSpan {
    readonly start: number;
    readonly length: number;
}

export interface CSharpTextChange {
    readonly span: CSharpTextSpan;
    readonly newText: string;
}

export type CSharpFormattingNewLineOptions = Omit<CSharpNewLineOptions, "beforeOpenBrace"> & {
    readonly beforeOpenBrace: "all" | "none" | readonly CSharpOpenBraceContext[];
};

export type CSharpFormattingSpacingOptions = Omit<CSharpSpacingOptions, "betweenParentheses"> & {
    readonly betweenParentheses: readonly CSharpParenthesisSpacingContext[];
};

export interface CSharpFormattingOptions {
    readonly indentation: IndentationOptions;
    readonly maxLineLength?: number;
    readonly csharpIndentation: CSharpIndentationOptions;
    readonly csharpNewLines: CSharpFormattingNewLineOptions;
    readonly csharpSpacing: CSharpFormattingSpacingOptions;
    readonly csharpWrapping: CSharpWrappingOptions;
    readonly lineEnding: LineEnding;
    readonly insertFinalNewline: boolean;
    readonly trimTrailingWhitespace: boolean;
    readonly charset: Charset;
}

interface CSharpFormattingRequestBase {
    readonly source: string;
    readonly options: CSharpFormattingOptions;
    readonly signal?: AbortSignal;
}

export interface CSharpDocumentFormattingRequest extends CSharpFormattingRequestBase {
    readonly kind: "document";
}

export interface CSharpRangeFormattingRequest extends CSharpFormattingRequestBase {
    readonly kind: "range";
    readonly span: CSharpTextSpan;
}

export interface CSharpSnippetFormattingRequest extends CSharpFormattingRequestBase {
    readonly kind: "snippet";
    readonly snippetKind: CSharpSnippetKind;
}

export type CSharpFormattingRequest =
    | CSharpDocumentFormattingRequest
    | CSharpRangeFormattingRequest
    | CSharpSnippetFormattingRequest;

export interface CSharpFormattingResult {
    readonly changes: readonly CSharpTextChange[];
}

export interface CSharpFormattingBackend {
    readonly kind: CSharpFormattingBackendKind;
    format(request: CSharpFormattingRequest): Promise<CSharpFormattingResult>;
}

export function createCSharpFormattingOptions(editorConfig: WorkbenchEditorConfig): CSharpFormattingOptions {
    return {
        indentation: editorConfig.indentation,
        maxLineLength: editorConfig.maxLineLength,
        csharpIndentation: editorConfig.csharpIndentation,
        csharpNewLines: {
            ...editorConfig.csharpNewLines,
            beforeOpenBrace:
                typeof editorConfig.csharpNewLines.beforeOpenBrace === "string"
                    ? editorConfig.csharpNewLines.beforeOpenBrace
                    : [...editorConfig.csharpNewLines.beforeOpenBrace],
        },
        csharpSpacing: {
            ...editorConfig.csharpSpacing,
            betweenParentheses: [...editorConfig.csharpSpacing.betweenParentheses],
        },
        csharpWrapping: editorConfig.csharpWrapping,
        lineEnding: editorConfig.lineEnding,
        insertFinalNewline: editorConfig.insertFinalNewline,
        trimTrailingWhitespace: editorConfig.trimTrailingWhitespace,
        charset: editorConfig.charset,
    };
}

export function applyCSharpTextChanges(source: string, changes: readonly CSharpTextChange[]): string {
    const descendingChanges = [...changes].sort((left, right) => right.span.start - left.span.start);
    let result = source;
    let nextChangeStart = source.length;

    for (const change of descendingChanges) {
        const changeEnd = change.span.start + change.span.length;
        if (change.span.start < 0 || change.span.length < 0 || changeEnd > source.length || changeEnd > nextChangeStart) {
            throw new RangeError("C# formatting backend returned an invalid or overlapping text change.");
        }

        result = result.slice(0, change.span.start) + change.newText + result.slice(changeEnd);
        nextChangeStart = change.span.start;
    }

    return result;
}
