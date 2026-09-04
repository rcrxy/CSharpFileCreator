import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HtmlFormattingOptions } from "../../core/editorConfig";
import { formatRazorMarkup } from "../../features/formatting/services/razorMarkupFormatter";

const html: HtmlFormattingOptions = {
    indentation: { style: "space", size: 2, tabWidth: 2 },
    spacesAroundAttributeEquals: false,
    spaceAfterLastAttribute: false,
    spaceBeforeSelfClosing: true,
    attributeStyle: "on_single_line",
    attributeIndent: "single_indent",
    maxBlankLinesBetweenTags: 1,
    lineBreakBeforeAllElements: false,
    lineBreakBeforeMultilineElements: true,
    lineBreaksInsideMultilineElements: true,
    lineBreaksInsideElementsWithChildElements: true,
    noIndentInsideElements: new Set(["pre", "textarea"]),
    preserveSpacesInsideTags: new Set(["pre", "textarea"]),
    extraSpaces: "remove_all",
};

function format(
    source: string,
    overrides: Partial<HtmlFormattingOptions> = {},
    formatCSharp?: (source: string) => string,
): string {
    const resolvedHtml = { ...html, ...overrides };
    return formatRazorMarkup(source, {
        indentation: resolvedHtml.indentation,
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
