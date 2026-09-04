import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    resolveCSharpNewLineOptions,
    resolveCSharpSpacingOptions,
    resolveCSharpWrappingOptions,
    resolveHtmlFormattingOptions,
    resolveMaxLineLength,
} from "../../core/editorConfig";

describe("EditorConfig options", () => {
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

    it("resolves max_line_length from EditorConfig, VS Code fallback, or the default", () => {
        assert.equal(resolveMaxLineLength(120, 100), 120);
        assert.equal(resolveMaxLineLength("140", 100), 140);
        assert.equal(resolveMaxLineLength(undefined, 100), 100);
        assert.equal(resolveMaxLineLength("invalid", 100), 100);
        assert.equal(resolveMaxLineLength(undefined), 80);
        assert.equal(resolveMaxLineLength("off", 100), undefined);
        assert.equal(resolveMaxLineLength(0, 0), 80);
    });

    it("resolves HTML rules with language, compatibility, standard, editor, and default priority", () => {
        const fallback = { insertSpaces: false, tabSize: 8 };
        const languageSpecific = resolveHtmlFormattingOptions(
            {
                html_indent_style: "space",
                html_indent_size: 2,
                html_tab_width: 3,
                indent_style: "tab",
                indent_size: 6,
                resharper_html_indent_size: 7,
                html_attribute_style: "on_different_lines",
                resharper_html_attribute_style: "do_not_touch",
                html_spaces_around_eq_in_attribute: true,
                html_no_indent_inside_elements: "pre, code",
            },
            fallback,
        );
        assert.deepEqual(languageSpecific.indentation, { style: "space", size: 2, tabWidth: 3 });
        assert.equal(languageSpecific.attributeStyle, "on_different_lines");
        assert.equal(languageSpecific.spacesAroundAttributeEquals, true);
        assert.deepEqual([...languageSpecific.noIndentInsideElements], ["pre", "code"]);

        const compatibility = resolveHtmlFormattingOptions(
            {
                resharper_html_attribute_style: "first_attribute_on_single_line",
                resharper_html_attribute_indent: "double_indent",
                resharper_html_max_blank_lines_between_tags: "2",
            },
            fallback,
        );
        assert.equal(compatibility.attributeStyle, "first_attribute_on_single_line");
        assert.equal(compatibility.attributeIndent, "double_indent");
        assert.equal(compatibility.maxBlankLinesBetweenTags, 2);
        assert.deepEqual(compatibility.indentation, { style: "tab", size: 8, tabWidth: 8 });

        const standard = resolveHtmlFormattingOptions({ indent_style: "space", indent_size: 4 }, fallback);
        assert.deepEqual(standard.indentation, { style: "space", size: 4, tabWidth: 4 });

        const defaults = resolveHtmlFormattingOptions({}, {});
        assert.equal(defaults.attributeStyle, "on_single_line");
        assert.equal(defaults.attributeIndent, "single_indent");
        assert.equal(defaults.maxBlankLinesBetweenTags, 1);
        assert.deepEqual([...defaults.preserveSpacesInsideTags], ["pre", "textarea"]);
        assert.equal(defaults.extraSpaces, "remove_all");
    });
});
