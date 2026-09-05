import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
    resolveEditorConfig,
    resolveRawEditorConfig,
    resolveCSharpNewLineOptions,
    resolveCSharpSpacingOptions,
    resolveCSharpWrappingOptions,
    resolveHtmlFormattingOptions,
    resolveMaxLineLength,
} from "../../core/editorConfig";
import {
    defaultProfilePath,
    initializeDefaultEditorConfigProfile,
    resolveDefaultEditorConfigProfile,
} from "../../core/editorConfig/defaultProfile";

describe("EditorConfig options", () => {
    it("uses Roslyn-compatible defaults", () => {
        assert.deepEqual(resolveCSharpNewLineOptions({}), {
            beforeOpenBrace: "all",
            beforeElse: true,
            beforeCatch: true,
            beforeFinally: true,
            beforeMembersInObjectInitializers: true,
            beforeMembersInAnonymousTypes: true,
            betweenQueryExpressionClauses: true,
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
            betweenMethodCallNameAndOpeningParenthesis: false,
            betweenMethodCallParameterListParentheses: false,
            betweenMethodCallEmptyParameterListParentheses: false,
            betweenMethodDeclarationNameAndOpeningParenthesis: false,
            betweenMethodDeclarationParameterListParentheses: false,
            betweenMethodDeclarationEmptyParameterListParentheses: false,
            betweenParentheses: new Set(),
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
            csharp_new_line_before_members_in_object_initializers: "false",
            csharp_new_line_before_members_in_anonymous_types: false,
            csharp_new_line_between_query_expression_clauses: "false",
        });

        assert.ok(newLines.beforeOpenBrace instanceof Set);
        assert.deepEqual([...newLines.beforeOpenBrace], ["methods", "control_blocks"]);
        assert.equal(newLines.beforeElse, false);
        assert.equal(newLines.beforeCatch, false);
        assert.equal(newLines.beforeFinally, false);
        assert.equal(newLines.beforeMembersInObjectInitializers, false);
        assert.equal(newLines.beforeMembersInAnonymousTypes, false);
        assert.equal(newLines.betweenQueryExpressionClauses, false);

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
                csharp_space_between_method_call_name_and_opening_parenthesis: "true",
                csharp_space_between_method_call_parameter_list_parentheses: true,
                csharp_space_between_method_call_empty_parameter_list_parentheses: "true",
                csharp_space_between_method_declaration_name_and_open_parenthesis: true,
                csharp_space_between_method_declaration_parameter_list_parentheses: "true",
                csharp_space_between_method_declaration_empty_parameter_list_parentheses: true,
                csharp_space_between_parentheses: "control_flow_statements, expressions, type_casts, invalid",
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
                betweenMethodCallNameAndOpeningParenthesis: true,
                betweenMethodCallParameterListParentheses: true,
                betweenMethodCallEmptyParameterListParentheses: true,
                betweenMethodDeclarationNameAndOpeningParenthesis: true,
                betweenMethodDeclarationParameterListParentheses: true,
                betweenMethodDeclarationEmptyParameterListParentheses: true,
                betweenParentheses: new Set(["control_flow_statements", "expressions", "type_casts"]),
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
                html_attribute_wrap: "normal",
                ij_html_attribute_wrap: "split_into_lines",
                resharper_html_attribute_style: "do_not_touch",
                html_spaces_around_eq_in_attribute: true,
                html_no_indent_inside_elements: "pre, code",
            },
            fallback,
        );
        assert.deepEqual(languageSpecific.indentation, { style: "space", size: 2, tabWidth: 3 });
        assert.equal(languageSpecific.attributeStyle, "on_different_lines");
        assert.equal(languageSpecific.attributeWrap, "normal");
        assert.equal(languageSpecific.spacesAroundAttributeEquals, true);
        assert.deepEqual([...languageSpecific.noIndentInsideElements], ["pre", "code"]);

        const compatibility = resolveHtmlFormattingOptions(
            {
                resharper_html_attribute_style: "first_attribute_on_single_line",
                ij_html_attribute_wrap: "split_into_lines",
                resharper_html_attribute_indent: "double_indent",
                resharper_html_max_blank_lines_between_tags: "2",
            },
            fallback,
        );
        assert.equal(compatibility.attributeStyle, "first_attribute_on_single_line");
        assert.equal(compatibility.attributeWrap, "split_into_lines");
        assert.equal(compatibility.attributeWrap, "split_into_lines");
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

    it("covers every supported option with Microsoft, JetBrains, or compatibility defaults", async () => {
        const profileFile = path.join(process.cwd(), ...defaultProfilePath);
        initializeDefaultEditorConfigProfile(await readFile(profileFile));

        const csharpProfile = await resolveDefaultEditorConfigProfile({ path: "/Example.cs", fsPath: "Example.cs" } as never);
        const razorProfile = await resolveDefaultEditorConfigProfile({
            path: "/Example.razor",
            fsPath: "Example.razor",
        } as never);

        const expectedCSharpProfile = {
            indent_style: "space",
            indent_size: 4,
            tab_width: 4,
            max_line_length: 120,
            end_of_line: "lf",
            insert_final_newline: false,
            trim_trailing_whitespace: false,
            charset: "utf-8",
            csharp_indent_block_contents: true,
            csharp_indent_braces: false,
            csharp_indent_case_contents: true,
            csharp_indent_switch_labels: true,
            csharp_indent_case_contents_when_block: true,
            csharp_indent_labels: "one_less_than_current",
            csharp_new_line_before_open_brace: "all",
            csharp_new_line_before_else: true,
            csharp_new_line_before_catch: true,
            csharp_new_line_before_finally: true,
            csharp_new_line_before_members_in_object_initializers: true,
            csharp_new_line_before_members_in_anonymous_types: true,
            csharp_new_line_between_query_expression_clauses: true,
            csharp_space_after_keywords_in_control_flow_statements: true,
            csharp_space_around_binary_operators: "before_and_after",
            csharp_space_after_comma: true,
            csharp_space_before_comma: false,
            csharp_space_after_semicolon_in_for_statement: true,
            csharp_space_before_semicolon_in_for_statement: false,
            csharp_space_after_cast: false,
            csharp_space_before_colon_in_inheritance_clause: true,
            csharp_space_after_colon_in_inheritance_clause: true,
            csharp_space_between_method_call_name_and_opening_parenthesis: false,
            csharp_space_between_method_call_parameter_list_parentheses: false,
            csharp_space_between_method_call_empty_parameter_list_parentheses: false,
            csharp_space_between_method_declaration_name_and_open_parenthesis: false,
            csharp_space_between_method_declaration_parameter_list_parentheses: false,
            csharp_space_between_method_declaration_empty_parameter_list_parentheses: false,
            csharp_space_between_parentheses: false,
            csharp_preserve_single_line_statements: true,
            csharp_preserve_single_line_blocks: true,
        } as const;
        for (const [name, value] of Object.entries(expectedCSharpProfile)) {
            assert.equal(csharpProfile[name], value, name);
        }

        const expectedRazorProfile = {
            indent_style: "space",
            indent_size: 4,
            tab_width: 4,
            max_line_length: 120,
            end_of_line: "lf",
            insert_final_newline: true,
            trim_trailing_whitespace: false,
            charset: "utf-8",
            html_indent_style: "space",
            html_indent_size: 4,
            html_tab_width: 4,
            html_spaces_around_eq_in_attribute: false,
            html_space_after_last_attribute: false,
            html_space_before_self_closing: true,
            html_attribute_style: "on_single_line",
            html_attribute_wrap: "off",
            ij_html_attribute_wrap: "off",
            html_attribute_indent: "single_indent",
            html_max_blank_lines_between_tags: 1,
            html_linebreak_before_all_elements: false,
            html_linebreak_before_multiline_elements: true,
            html_linebreaks_inside_tags_for_multiline_elements: true,
            html_linebreaks_inside_tags_for_elements_with_child_elements: true,
            html_no_indent_inside_elements: "pre,textarea",
            html_preserve_spaces_inside_tags: "pre,textarea",
            html_extra_spaces: "remove_all",
        } as const;
        for (const [name, value] of Object.entries(expectedRazorProfile)) {
            assert.equal(razorProfile[name], value, name);
        }

        assert.equal(razorProfile.csharp_new_line_before_open_brace, undefined);
    });

    it("keeps dynamic editor fallbacks ahead of Profile defaults", () => {
        const profile = { indent_style: "space", indent_size: 4, tab_width: 4 };
        assert.deepEqual(resolveHtmlFormattingOptions({}, { insertSpaces: false, tabSize: 8 }, profile).indentation, {
            style: "tab",
            size: 8,
            tabWidth: 8,
        });
        assert.deepEqual(
            resolveHtmlFormattingOptions({ html_indent_size: 2 }, { insertSpaces: false, tabSize: 8 }, profile).indentation,
            { style: "tab", size: 2, tabWidth: 2 },
        );
        assert.equal(resolveMaxLineLength(undefined, 120, 80), 120);
        assert.equal(resolveMaxLineLength(100, 120, 80), 100);
    });

    it("resolves dynamic document state before fixed Profile defaults", async () => {
        const profileFile = path.join(process.cwd(), ...defaultProfilePath);
        initializeDefaultEditorConfigProfile(await readFile(profileFile));
        const resource = { scheme: "untitled", path: "/Example.cs", fsPath: "Example.cs" } as never;
        const resolved = await resolveEditorConfig(resource, {
            insertSpaces: false,
            tabSize: 6,
            maxLineLength: 120,
            profileFileName: "document.cs",
            lineEnding: "\r\n",
            insertFinalNewline: false,
            trimTrailingWhitespace: true,
            charset: "utf-8-bom",
        });

        assert.deepEqual(resolved.indentation, { style: "tab", size: 6, tabWidth: 6 });
        assert.equal(resolved.maxLineLength, 120);
        assert.equal(resolved.lineEnding, "\r\n");
        assert.equal(resolved.insertFinalNewline, false);
        assert.equal(resolved.trimTrailingWhitespace, true);
        assert.equal(resolved.charset, "utf-8-bom");
        assert.equal(resolved.csharpNewLines.beforeOpenBrace, "all");
    });

    it("always resolves project EditorConfig properties before dynamic state and the built-in Profile", async () => {
        const profileFile = path.join(process.cwd(), ...defaultProfilePath);
        initializeDefaultEditorConfigProfile(await readFile(profileFile));
        const directory = await mkdtemp(path.join(tmpdir(), "csharp-workbench-editorconfig-"));

        try {
            await writeFile(
                path.join(directory, ".editorconfig"),
                [
                    "root = true",
                    "",
                    "[*]",
                    "indent_style = space",
                    "indent_size = 2",
                    "max_line_length = 100",
                    "insert_final_newline = true",
                    "",
                    "[*.cs]",
                    "csharp_new_line_before_open_brace = none",
                    "",
                    "[*.razor]",
                    "html_attribute_style = on_different_lines",
                ].join("\n"),
            );

            const fallback = { insertSpaces: false, tabSize: 8, maxLineLength: 120, insertFinalNewline: false };
            const csharp = await resolveEditorConfig(
                { scheme: "file", path: "/Example.cs", fsPath: path.join(directory, "Example.cs") } as never,
                fallback,
            );
            const razor = await resolveEditorConfig(
                { scheme: "file", path: "/Example.razor", fsPath: path.join(directory, "Example.razor") } as never,
                fallback,
            );

            assert.deepEqual(csharp.indentation, { style: "space", size: 2, tabWidth: 2 });
            assert.equal(csharp.maxLineLength, 100);
            assert.equal(csharp.insertFinalNewline, true);
            assert.equal(csharp.csharpNewLines.beforeOpenBrace, "none");
            assert.equal(razor.html.attributeStyle, "on_different_lines");
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("exports resolved EditorConfig properties as raw string values", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "csharp-workbench-raw-editorconfig-"));

        try {
            await writeFile(
                path.join(directory, ".editorconfig"),
                [
                    "root = true",
                    "",
                    "[*.cs]",
                    "indent_size = 2",
                    "insert_final_newline = true",
                    "csharp_space_after_comma = false",
                ].join("\n"),
            );

            const properties = await resolveRawEditorConfig({
                scheme: "file",
                path: "/Example.cs",
                fsPath: path.join(directory, "Example.cs"),
            } as never);

            assert.equal(properties.indent_size, "2");
            assert.equal(properties.insert_final_newline, "true");
            assert.equal(properties.csharp_space_after_comma, "false");
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
