import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CSharpIndentationOptions, CSharpNewLineOptions, HtmlFormattingOptions } from "../../core/editorConfig";
import { formatRazorMarkup } from "../../features/formatting/services/razorMarkupFormatter";

const html: HtmlFormattingOptions = {
    indentation: { style: "space", size: 2, tabWidth: 2 },
    spacesAroundAttributeEquals: false,
    spaceAfterLastAttribute: false,
    spaceBeforeSelfClosing: true,
    attributeStyle: "on_single_line",
    attributeWrap: "off",
    attributeIndent: "single_indent",
    maxLineLength: 80,
    maxBlankLinesBetweenTags: 1,
    lineBreakBeforeAllElements: false,
    lineBreakBeforeMultilineElements: true,
    lineBreaksInsideMultilineElements: true,
    lineBreaksInsideElementsWithChildElements: true,
    noIndentInsideElements: new Set(["pre", "textarea"]),
    preserveSpacesInsideTags: new Set(["pre", "textarea"]),
    extraSpaces: "remove_all",
};

const csharpIndentation: CSharpIndentationOptions = {
    indentBlockContents: true,
    indentBraces: false,
    indentCaseContents: true,
    indentSwitchLabels: false,
    indentCaseContentsWhenBlock: false,
    indentLabels: "one_less_than_current",
};

const csharpNewLines: CSharpNewLineOptions = {
    beforeOpenBrace: "none",
    beforeElse: false,
    beforeCatch: false,
    beforeFinally: false,
};

function format(
    source: string,
    overrides: Partial<HtmlFormattingOptions> = {},
    formatCSharp?: (source: string) => string,
    csharpIndentationOverrides: Partial<CSharpIndentationOptions> = {},
): string {
    const resolvedHtml = { ...html, ...overrides };
    return formatRazorMarkup(source, {
        indentation: resolvedHtml.indentation,
        csharpIndentation: { ...csharpIndentation, ...csharpIndentationOverrides },
        csharpNewLines,
        html: resolvedHtml,
        lineEnding: "\n",
        insertFinalNewline: false,
        trimTrailingWhitespace: true,
        charset: "utf-8",
        formatCSharp,
    });
}

describe("Razor markup formatting pipeline", () => {
    it("uses HTML-specific indentation for nested tags", () => {
        assert.equal(format("<div><span>Value</span></div>"), "<div>\n  <span>Value</span>\n</div>");
    });

    it("preserves align-by-first-attribute indentation after nesting tags", () => {
        const source = [
            '<div class="store-index">',
            '<RadzenDataGrid AllowFiltering="true" AllowColumnResize="true" AllowAlternatingRows="false">',
            "<Columns>",
            '<RadzenDataGridColumn Property="@nameof(StoreEntity.Name)" Title="First Name" Frozen="true" />',
            "</Columns>",
            "</RadzenDataGrid>",
            "</div>",
        ].join("\n");
        const result = format(source, {
            indentation: { style: "space", size: 4, tabWidth: 4 },
            attributeStyle: "first_attribute_on_single_line",
            attributeIndent: "align_by_first_attribute",
            spaceAfterLastAttribute: true,
        });

        assert.match(result, /^    <RadzenDataGrid AllowFiltering="true"$/m);
        assert.match(result, /^                    AllowColumnResize="true"$/m);
        assert.match(result, /^                    AllowAlternatingRows="false" >$/m);
        assert.match(result, /^            <RadzenDataGridColumn Property="@nameof\(StoreEntity.Name\)"$/m);
        assert.match(result, /^                                  Title="First Name"$/m);
        assert.match(result, /^                                  Frozen="true" \/>$/m);
        assert.match(result, /^<div class="store-index" >$/m);
    });

    it("normalizes previously misaligned multiline attributes without reusing old parent indentation", () => {
        const source = [
            '<div class="store-index" >',
            '   <RadzenDataGrid AllowFiltering="true"',
            '                      AllowColumnResize="true"',
            '                      AllowAlternatingRows="false" >',
            "      <Columns>",
            '         <RadzenDataGridColumn Property="@nameof(StoreEntity.Name)"',
            '                                        Title="First Name"',
            '                                        Frozen="true" />',
            "      </Columns>",
            "   </RadzenDataGrid>",
            "</div>",
        ].join("\n");
        const result = format(source, {
            indentation: { style: "space", size: 3, tabWidth: 3 },
            attributeStyle: "first_attribute_on_single_line",
            attributeIndent: "align_by_first_attribute",
            spaceAfterLastAttribute: true,
        });

        assert.match(result, /^   <RadzenDataGrid AllowFiltering="true"$/m);
        assert.match(result, /^                   AllowColumnResize="true"$/m);
        assert.match(result, /^                   AllowAlternatingRows="false" >$/m);
        assert.match(result, /^         <RadzenDataGridColumn Property="@nameof\(StoreEntity.Name\)"$/m);
        assert.match(result, /^                               Title="First Name"$/m);
        assert.match(result, /^                               Frozen="true" \/>$/m);
    });

    it("preserves Razor expression strings while wrapping attributes in nested component templates", () => {
        const source = [
            "<Columns>",
            '<RadzenDataGridColumn Property="@nameof(StoreEntity.IsEnabled)" Title="启用状态" Frozen="true" Width="100px">',
            '<Template Context="store">',
            '<RadzenIcon Icon="@(store.IsEnabled ? "check_circle" : "cancel")" Style="@(store.IsEnabled ? "color: var(--rz-success);" : "color: var(--rz-danger);")" />',
            "</Template>",
            "</RadzenDataGridColumn>",
            "</Columns>",
        ].join("\n");
        const options: Partial<HtmlFormattingOptions> = {
            indentation: { style: "space", size: 3, tabWidth: 3 },
            attributeStyle: "on_different_lines",
            attributeIndent: "double_indent",
            attributeWrap: "normal",
            maxLineLength: 80,
        };
        const expected = [
            "<Columns>",
            "   <RadzenDataGridColumn",
            '         Property="@nameof(StoreEntity.IsEnabled)"',
            '         Title="启用状态"',
            '         Frozen="true"',
            '         Width="100px">',
            '      <Template Context="store">',
            "         <RadzenIcon",
            '               Icon="@(store.IsEnabled ? "check_circle" : "cancel")"',
            '               Style="@(store.IsEnabled ? "color: var(--rz-success);" : "color: var(--rz-danger);")" />',
            "      </Template>",
            "   </RadzenDataGridColumn>",
            "</Columns>",
        ].join("\n");

        const result = format(source, options);
        assert.equal(result, expected);
        assert.equal(format(result, options), expected);
    });

    it("does not indent or normalize configured protected element contents", () => {
        const source =
            "<div>\n<pre>  first   value\n    second </pre>\n<textarea> third   value </textarea>\n<span>After</span>\n</div>";
        const result = format(source);
        assert.match(result, /<pre>  first   value\n    second <\/pre>/);
        assert.match(result, /<textarea> third   value <\/textarea>/);
        assert.match(result, /^  <span>After<\/span>$/m);
    });

    it("protects Razor C# generics from tag formatting and then invokes the C# formatter", () => {
        let received = "";
        const source = "<div><span>Value</span></div>\n@code {\nList<string> values = new();\nif (count > 0)\nUse(values);\n}";
        const result = format(source, {}, csharpSource => {
            received = csharpSource;
            return csharpSource.replace("Use(values);", "    Use(values);");
        });

        assert.match(received, /List<string>/);
        assert.match(received, /count > 0/);
        assert.match(result, /@code \{\n  List<string> values = new\(\);/);
        assert.match(result, /\n      Use\(values\);\n}/);
    });

    it("supports multiple Razor C# blocks without mixing protected values", () => {
        const source = "@code {\nList<string> first = new();\n}\n<div></div>\n@functions {\nList<int> second = new();\n}";
        const result = format(source, {}, value => value);
        assert.match(result, /List<string> first/);
        assert.match(result, /List<int> second/);
    });

    it("indents inline Razor statement bodies and their first C# lines", () => {
        const source = [
            "<div>",
            "@if (enabled)",
            "{",
            "var value = 1;",
            '<RadzenIcon Icon="check_circle" />',
            "}",
            "</div>",
        ].join("\n");

        assert.equal(
            format(source, { indentation: { style: "space", size: 3, tabWidth: 3 } }),
            [
                "<div>",
                "   @if (enabled) {",
                "      var value = 1;",
                '      <RadzenIcon Icon="check_circle" />',
                "   }",
                "</div>",
            ].join("\n"),
        );
    });

    it("preserves single-line Razor if blocks without losing the surrounding markup depth", () => {
        const source = [
            "<div>",
            '@if (showIcon) { <RadzenIcon Icon="check_circle" /> }',
            "@if (increment) { count++; }",
            "<span>After</span>",
            "</div>",
        ].join("\n");

        assert.equal(
            format(source, { indentation: { style: "space", size: 3, tabWidth: 3 } }),
            [
                "<div>",
                '   @if (showIcon) { <RadzenIcon Icon="check_circle" /> }',
                "   @if (increment) { count++; }",
                "   <span>After</span>",
                "</div>",
            ].join("\n"),
        );
    });

    it("respects csharp_indent_block_contents for Razor control blocks", () => {
        const source = ["<div>", "@if (enabled)", "{", "var value = 1;", "<span>Value</span>", "}", "</div>"].join("\n");

        assert.equal(
            format(source, { indentation: { style: "space", size: 3, tabWidth: 3 } }, undefined, {
                indentBlockContents: false,
            }),
            ["<div>", "   @if (enabled) {", "   var value = 1;", "   <span>Value</span>", "   }", "</div>"].join("\n"),
        );
    });

    it("formats chained and other Razor control blocks with the configured brace rules", () => {
        const source = [
            "<div>",
            "@if (first)",
            "{",
            "<span>First</span>",
            "}",
            "else if (second)",
            "{",
            "var value = 2;",
            "}",
            "else",
            "{",
            "<span>Other</span>",
            "}",
            "@try",
            "{",
            "Run();",
            "}",
            "catch (Exception)",
            "{",
            "Recover();",
            "}",
            "finally",
            "{",
            "Cleanup();",
            "}",
            "@foreach (var item in items)",
            "{",
            "<span>@item</span>",
            "}",
            "@switch (state)",
            "{",
            "RenderState();",
            "}",
            "@do",
            "{",
            "Advance();",
            "}",
            "while (pending);",
            "</div>",
        ].join("\n");

        const expected = [
            "<div>",
            "   @if (first) {",
            "      <span>First</span>",
            "   } else if (second) {",
            "      var value = 2;",
            "   } else {",
            "      <span>Other</span>",
            "   }",
            "   @try {",
            "      Run();",
            "   } catch (Exception) {",
            "      Recover();",
            "   } finally {",
            "      Cleanup();",
            "   }",
            "   @foreach (var item in items) {",
            "      <span>@item</span>",
            "   }",
            "   @switch (state) {",
            "      RenderState();",
            "   }",
            "   @do {",
            "      Advance();",
            "   } while (pending);",
            "</div>",
        ].join("\n");
        const result = format(source, { indentation: { style: "space", size: 3, tabWidth: 3 } });

        assert.equal(result, expected);
        assert.equal(format(result, { indentation: { style: "space", size: 3, tabWidth: 3 } }), expected);
    });

    it("normalizes output to the configured line ending", () => {
        const result = formatRazorMarkup("<div>\r\n<span>Value</span>\r\n</div>\r\n", {
            indentation: html.indentation,
            html,
            lineEnding: "\r\n",
            insertFinalNewline: true,
            trimTrailingWhitespace: true,
            charset: "utf-8",
        });
        assert.equal(result.replace(/\r\n/g, "").includes("\n"), false);
        assert.ok(result.endsWith("\r\n"));
    });
});
