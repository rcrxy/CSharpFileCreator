import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCSharpTextChanges, type CSharpFormattingOptions } from "../../features/formatting/csharpFormattingBackend";
import { LightweightCSharpFormattingBackend } from "../../features/formatting/backends/lightweightCSharpFormattingBackend";

const options: CSharpFormattingOptions = {
    indentation: { style: "space", size: 4, tabWidth: 4 },
    maxLineLength: 120,
    csharpIndentation: {
        indentBlockContents: true,
        indentBraces: false,
        indentCaseContents: true,
        indentSwitchLabels: true,
        indentCaseContentsWhenBlock: true,
        indentLabels: "one_less_than_current",
    },
    csharpNewLines: {
        beforeOpenBrace: "all",
        beforeElse: true,
        beforeCatch: true,
        beforeFinally: true,
        beforeMembersInObjectInitializers: true,
        beforeMembersInAnonymousTypes: true,
        betweenQueryExpressionClauses: true,
    },
    csharpSpacing: {
        afterControlFlowKeyword: true,
        aroundBinaryOperators: "before_and_after",
        afterComma: true,
        beforeComma: false,
        afterForSemicolon: true,
        beforeForSemicolon: false,
        afterCast: false,
        beforeInheritanceColon: true,
        afterInheritanceColon: true,
        betweenMethodCallNameAndOpeningParenthesis: false,
        betweenMethodCallParameterListParentheses: false,
        betweenMethodCallEmptyParameterListParentheses: false,
        betweenMethodDeclarationNameAndOpeningParenthesis: false,
        betweenMethodDeclarationParameterListParentheses: false,
        betweenMethodDeclarationEmptyParameterListParentheses: false,
        betweenParentheses: [],
    },
    csharpWrapping: {
        preserveSingleLineStatements: true,
        preserveSingleLineBlocks: false,
    },
    lineEnding: "\n",
    insertFinalNewline: true,
    trimTrailingWhitespace: true,
    charset: "utf-8",
};

describe("C# formatting backend contract", () => {
    it("formats a document and returns backend-neutral text changes", async () => {
        const backend = new LightweightCSharpFormattingBackend();
        const source = "class Demo {\n}\n\n";

        const result = await backend.format({ source, kind: "document", options });
        const formatted = applyCSharpTextChanges(source, result.changes);

        assert.equal(backend.kind, "lightweight");
        assert.deepEqual(result.changes[0]?.span, { start: 0, length: source.length });
        assert.equal(formatted, "class Demo\n{\n}\n");
    });

    it("formats a range with the surrounding indentation context", async () => {
        const backend = new LightweightCSharpFormattingBackend();
        const source = ["class Demo", "{", "void Run()", "{", "if(ready)", "Work();", "}", "}"].join("\n");
        const selectedSource = "if(ready)\nWork();";
        const start = source.indexOf(selectedSource);

        const result = await backend.format({
            source,
            kind: "range",
            span: { start, length: selectedSource.length },
            options,
        });

        assert.deepEqual(result.changes[0]?.span, { start, length: selectedSource.length });
        assert.equal(result.changes[0]?.newText, "        if (ready)\n            Work();");
    });

    it("formats a type-members snippet without applying document final-newline rules", async () => {
        const backend = new LightweightCSharpFormattingBackend();
        const source = "void Run() {\nWork();\n}";

        const result = await backend.format({
            source,
            kind: "snippet",
            snippetKind: "type-members",
            options,
        });
        const formatted = applyCSharpTextChanges(source, result.changes);

        assert.equal(formatted, "void Run()\n{\n    Work();\n}");
        assert.equal(formatted.endsWith("\n"), false);
    });

    it("returns no changes when the request is already cancelled", async () => {
        const backend = new LightweightCSharpFormattingBackend();
        const controller = new AbortController();
        controller.abort();

        const result = await backend.format({
            source: "class Demo {\n}",
            kind: "document",
            options,
            signal: controller.signal,
        });

        assert.deepEqual(result, { changes: [] });
    });

    it("rejects a range outside the request source", async () => {
        const backend = new LightweightCSharpFormattingBackend();

        await assert.rejects(
            backend.format({
                source: "class Demo {}",
                kind: "range",
                span: { start: 20, length: 1 },
                options,
            }),
            RangeError,
        );
    });

    it("applies multiple text changes and rejects overlapping changes", () => {
        assert.equal(
            applyCSharpTextChanges("alpha beta", [
                { span: { start: 0, length: 5 }, newText: "first" },
                { span: { start: 6, length: 4 }, newText: "second" },
            ]),
            "first second",
        );

        assert.throws(
            () =>
                applyCSharpTextChanges("abcdef", [
                    { span: { start: 1, length: 3 }, newText: "x" },
                    { span: { start: 3, length: 2 }, newText: "y" },
                ]),
            RangeError,
        );
    });
});
