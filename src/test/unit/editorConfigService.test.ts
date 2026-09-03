import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    resolveCSharpNewLineOptions,
    resolveCSharpSpacingOptions,
    resolveCSharpWrappingOptions,
} from "../../core/editorConfig";

describe("C# EditorConfig options", () => {
    it("uses Roslyn-compatible defaults", () => {
        assert.deepEqual(resolveCSharpNewLineOptions({}), {
            beforeOpenBrace: "all",
            beforeElse: true,
            beforeCatch: true,
            beforeFinally: true,
        });
        assert.deepEqual(resolveCSharpSpacingOptions({}), {
            afterControlFlowKeyword: true,
            aroundBinaryOperators: "before_and_after",
            afterComma: true,
            beforeComma: false,
            afterForSemicolon: true,
            beforeForSemicolon: false,
            afterCast: false,
            beforeInheritanceColon: true,
            afterInheritanceColon: true,
        });
        assert.deepEqual(resolveCSharpWrappingOptions({}), {
            preserveSingleLineStatements: true,
            preserveSingleLineBlocks: true,
        });
    });

    it("parses explicit values and open-brace context lists", () => {
        const newLines = resolveCSharpNewLineOptions({
            csharp_new_line_before_open_brace: "methods, control_blocks, invalid",
            csharp_new_line_before_else: "false",
            csharp_new_line_before_catch: false,
            csharp_new_line_before_finally: "false",
        });

        assert.ok(newLines.beforeOpenBrace instanceof Set);
        assert.deepEqual([...newLines.beforeOpenBrace], ["methods", "control_blocks"]);
        assert.equal(newLines.beforeElse, false);
        assert.equal(newLines.beforeCatch, false);
        assert.equal(newLines.beforeFinally, false);

        assert.deepEqual(
            resolveCSharpSpacingOptions({
                csharp_space_after_keywords_in_control_flow_statements: "false",
                csharp_space_around_binary_operators: "none",
                csharp_space_after_comma: false,
                csharp_space_before_comma: "true",
                csharp_space_after_semicolon_in_for_statement: "false",
                csharp_space_before_semicolon_in_for_statement: true,
                csharp_space_after_cast: "true",
                csharp_space_before_colon_in_inheritance_clause: false,
                csharp_space_after_colon_in_inheritance_clause: "false",
            }),
            {
                afterControlFlowKeyword: false,
                aroundBinaryOperators: "none",
                afterComma: false,
                beforeComma: true,
                afterForSemicolon: false,
                beforeForSemicolon: true,
                afterCast: true,
                beforeInheritanceColon: false,
                afterInheritanceColon: false,
            },
        );
        assert.deepEqual(
            resolveCSharpWrappingOptions({
                csharp_preserve_single_line_statements: "false",
                csharp_preserve_single_line_blocks: false,
            }),
            { preserveSingleLineStatements: false, preserveSingleLineBlocks: false },
        );
    });

    it("supports all, none, ignore, and invalid fallbacks", () => {
        assert.equal(resolveCSharpNewLineOptions({ csharp_new_line_before_open_brace: "none" }).beforeOpenBrace, "none");
        assert.equal(resolveCSharpNewLineOptions({ csharp_new_line_before_open_brace: "unknown" }).beforeOpenBrace, "all");
        assert.equal(
            resolveCSharpSpacingOptions({ csharp_space_around_binary_operators: "ignore" }).aroundBinaryOperators,
            "ignore",
        );
        assert.equal(
            resolveCSharpSpacingOptions({ csharp_space_around_binary_operators: "invalid" }).aroundBinaryOperators,
            "before_and_after",
        );
    });
});
