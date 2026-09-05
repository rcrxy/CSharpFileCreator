import type {
    CSharpFormattingBackend,
    CSharpDocumentFormattingRequest,
    CSharpFormattingOptions,
    CSharpRangeFormattingRequest,
    CSharpFormattingRequest,
    CSharpFormattingResult,
    CSharpSnippetFormattingRequest,
    CSharpTextSpan,
} from "../csharpFormattingBackend";
import { formatCSharpCodeStyle, wrapCSharpLines } from "../services/csharpCodeStyleFormatter";
import { formatCSharpIndentation } from "../services/csharpIndentationFormatter";
import { formatDocumentText, formatSelectedText } from "../services/documentTextFormatter";

const unchangedResult: CSharpFormattingResult = { changes: [] };

export class LightweightCSharpFormattingBackend implements CSharpFormattingBackend {
    readonly kind = "lightweight";

    async format(request: CSharpFormattingRequest): Promise<CSharpFormattingResult> {
        if (request.signal?.aborted) {
            return unchangedResult;
        }

        const formatted = this.formatRequest(request);
        if (request.signal?.aborted || formatted.text === formatted.originalText) {
            return unchangedResult;
        }

        return {
            changes: [
                {
                    span: formatted.span,
                    newText: formatted.text,
                },
            ],
        };
    }

    private formatRequest(request: CSharpFormattingRequest): FormattedRequest {
        switch (request.kind) {
            case "document":
                return this.formatDocument(request);
            case "range":
                return this.formatRange(request);
            case "snippet":
                return this.formatSnippet(request);
        }
    }

    private formatDocument(request: CSharpDocumentFormattingRequest): FormattedRequest {
        const text = formatDocumentText(this.formatText(request.source, request.options), request.options);
        return {
            span: { start: 0, length: request.source.length },
            originalText: request.source,
            text,
        };
    }

    private formatRange(request: CSharpRangeFormattingRequest): FormattedRequest {
        const span = requireValidSpan(request.source, request.span);
        const selectedSource = request.source.slice(span.start, span.start + span.length);
        const codeStyleFormatted = this.formatCodeStyle(selectedSource, request.options);
        const prefix = request.source.slice(0, span.start);
        const contextualFormatted = formatCSharpIndentation(prefix + codeStyleFormatted, {
            indentation: request.options.indentation,
            csharpIndentation: request.options.csharpIndentation,
        });
        const lineEnding = detectLineEnding(request.source);
        const startLine = countLineBreaks(prefix);
        const selectedFormatted = contextualFormatted
            .split(/\r\n|\n|\r/)
            .slice(startLine)
            .join(lineEnding);
        const wrapped = wrapCSharpLines(selectedFormatted, request.options.maxLineLength, request.options.indentation);
        const text = formatSelectedText(wrapped, request.options.trimTrailingWhitespace);

        return { span, originalText: selectedSource, text };
    }

    private formatSnippet(request: CSharpSnippetFormattingRequest): FormattedRequest {
        return {
            span: { start: 0, length: request.source.length },
            originalText: request.source,
            text: this.formatText(request.source, request.options),
        };
    }

    private formatText(source: string, options: CSharpFormattingOptions): string {
        const codeStyleFormatted = this.formatCodeStyle(source, options);
        const indented = formatCSharpIndentation(codeStyleFormatted, {
            indentation: options.indentation,
            csharpIndentation: options.csharpIndentation,
        });

        return wrapCSharpLines(indented, options.maxLineLength, options.indentation);
    }

    private formatCodeStyle(source: string, options: CSharpFormattingOptions): string {
        return formatCSharpCodeStyle(source, {
            indentation: options.indentation,
            newLines: {
                ...options.csharpNewLines,
                beforeOpenBrace:
                    typeof options.csharpNewLines.beforeOpenBrace === "string"
                        ? options.csharpNewLines.beforeOpenBrace
                        : new Set(options.csharpNewLines.beforeOpenBrace),
            },
            spacing: {
                ...options.csharpSpacing,
                betweenParentheses: new Set(options.csharpSpacing.betweenParentheses),
            },
            wrapping: options.csharpWrapping,
        });
    }
}

interface FormattedRequest {
    readonly span: CSharpTextSpan;
    readonly originalText: string;
    readonly text: string;
}

function requireValidSpan(source: string, span: CSharpTextSpan): CSharpTextSpan {
    if (span.start < 0 || span.length < 0 || span.start + span.length > source.length) {
        throw new RangeError("C# range formatting requires a valid span within the source text.");
    }

    return span;
}

function detectLineEnding(source: string): "\n" | "\r\n" {
    return source.includes("\r\n") ? "\r\n" : "\n";
}

function countLineBreaks(source: string): number {
    return source.match(/\r\n|\n|\r/g)?.length ?? 0;
}
