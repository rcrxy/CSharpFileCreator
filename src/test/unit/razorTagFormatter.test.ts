import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HtmlFormattingOptions } from "../../core/editorConfig";
import { formatRazorTags } from "../../features/formatting/services/razorTagFormatter";

const defaults: HtmlFormattingOptions = {
    indentation: { style: "space", size: 4, tabWidth: 4 },
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

function format(source: string, overrides: Partial<HtmlFormattingOptions> = {}): string {
    return formatRazorTags(source, { ...defaults, ...overrides }, "\n");
}

describe("Razor tag formatting", () => {
    it("formats attribute equals and closing delimiter spaces", () => {
        assert.equal(format('<Widget A = "1" B= "2"/>'), '<Widget A="1" B="2" />');
        assert.equal(
            format('<Widget A="1"/>', {
                spacesAroundAttributeEquals: true,
                spaceBeforeSelfClosing: false,
            }),
            '<Widget A = "1"/>',
        );
        assert.equal(format('<div class="root">', { spaceAfterLastAttribute: true }), '<div class="root" >');
    });

    it("supports single-line and do-not-touch attribute styles", () => {
        assert.equal(format('<Widget\n    A = "1"\n    B = "2"\n/>'), '<Widget A="1" B="2" />');
        assert.equal(
            format('<Widget   A = "1"/>', { attributeStyle: "do_not_touch", extraSpaces: "leave_all" }),
            '<Widget   A="1" />',
        );
    });

    it("wraps normal attributes only after the visual line limit is exceeded", () => {
        assert.equal(
            format('<Widget A="1" B="2" />', { attributeWrap: "normal", maxLineLength: 23 }),
            '<Widget A="1" B="2" />',
        );
        assert.equal(format('<Widget A="1" B="2" />', { attributeWrap: "normal", maxLineLength: 22 }), '<Widget A="1" B="2" />');
        assert.equal(
            format('<Widget A="1" B="2" />', { attributeWrap: "normal", maxLineLength: 21, attributeStyle: "on_different_lines" }),
            '<Widget\n    A="1"\n    B="2" />',
        );
        assert.equal(format('<Widget A="a-long-value" />', { attributeWrap: "normal", maxLineLength: 5 }), '<Widget\n    A="a-long-value" />');
        assert.equal(format('<Widget A="1" B="2" />', { attributeWrap: "normal", maxLineLength: undefined }), '<Widget A="1" B="2" />');
        assert.equal(
            format('<Widget @onclick="Handle" @bind-Value="Value" />', {
                attributeWrap: "normal",
                attributeStyle: "on_different_lines",
                maxLineLength: 20,
            }),
            '<Widget\n    @onclick="Handle"\n    @bind-Value="Value" />',
        );
    });

    it("accounts for indentation and tabs when wrapping", () => {
        assert.equal(
            format('   <Widget A="1" B="2" />', {
                attributeWrap: "normal",
                attributeStyle: "on_different_lines",
                maxLineLength: 24,
                indentation: { style: "space", size: 3, tabWidth: 3 },
            }),
            '   <Widget\n      A="1"\n      B="2" />',
        );
        assert.equal(
            format('\t<Widget A="1" B="2" />', {
                attributeWrap: "normal",
                attributeStyle: "on_different_lines",
                maxLineLength: 25,
                indentation: { style: "tab", size: 4, tabWidth: 4 },
            }),
            '\t<Widget\n\t\tA="1"\n\t\tB="2" />',
        );
    });

    it("recovers existing multiline attributes when normal wrapping fits", () => {
        assert.equal(
            format('<Widget\n    A="1"\n    B="2" />', { attributeWrap: "normal", maxLineLength: 80 }),
            '<Widget A="1" B="2" />',
        );
    });

    it("keeps long tags single-line when max line length is off and is idempotent", () => {
        const source = '<Widget A="a-very-long-value" B="another-long-value" />';
        const once = format(source, { attributeWrap: "normal", maxLineLength: undefined });
        assert.equal(once, source);
        assert.equal(format(once, { attributeWrap: "normal", maxLineLength: undefined }), once);
    });

    it("does not apply length behavior for unsupported wrap policies", () => {
        const source = '<Widget A="1" B="2" />';
        const expected = '<Widget\n    A="1"\n    B="2" />';
        const options: Partial<HtmlFormattingOptions> = { attributeStyle: "on_different_lines", maxLineLength: 1 };
        assert.equal(format(source, { ...options, attributeWrap: "on_every_item" }), expected);
        assert.equal(format(source, { ...options, attributeWrap: "split_into_lines" }), expected);
    });

    it("applies each attribute style after normal wrapping is triggered", () => {
        const source = '<Widget A="1" B="2" C="3" />';
        const options: Partial<HtmlFormattingOptions> = { attributeWrap: "normal", maxLineLength: 20 };
        assert.equal(format(source, { ...options, attributeStyle: "on_single_line" }), '<Widget\n    A="1" B="2" C="3" />');
        assert.equal(
            format(source, { ...options, attributeStyle: "first_attribute_on_single_line" }),
            '<Widget A="1"\n    B="2"\n    C="3" />',
        );
        assert.equal(
            format(source, { ...options, attributeStyle: "on_different_lines" }),
            '<Widget\n    A="1"\n    B="2"\n    C="3" />',
        );
    });

    it("formats the Radzen normal-wrap scenario with three-column alignment", () => {
        const shortTag = '<RadzenButton Text="确定" Click="@Save" >';
        const longTag =
            '<RadzenDataGrid Data="@stores" AllowFiltering="true" AllowColumnResize="true" AllowSorting="true" PageSize="5" AllowPaging="true" >';
        const options: Partial<HtmlFormattingOptions> = {
            attributeWrap: "normal",
            attributeStyle: "first_attribute_on_single_line",
            attributeIndent: "align_by_first_attribute",
            indentation: { style: "space", size: 3, tabWidth: 3 },
            maxLineLength: 120,
            spaceAfterLastAttribute: true,
        };
        assert.equal(format(shortTag, options), shortTag);
        assert.equal(
            format(longTag, options),
            '<RadzenDataGrid Data="@stores"\n' +
                '                AllowFiltering="true"\n' +
                '                AllowColumnResize="true"\n' +
                '                AllowSorting="true"\n' +
                '                PageSize="5"\n' +
                '                AllowPaging="true" >',
        );
    });

    it("preserves do-not-touch line structure under normal wrapping", () => {
        const source = '<Widget\n    A = "1"\n        B = "2"\n>';
        assert.equal(
            format(source, { attributeWrap: "normal", attributeStyle: "do_not_touch", maxLineLength: 1 }),
            '<Widget\n    A="1"\n        B="2"\n>',
        );
    });

    it("keeps Razor directive attributes intact and remains idempotent", () => {
        const source = '<Widget @onclick="Handle" @bind-Value="Value" @attributes="Attributes" />';
        const options: Partial<HtmlFormattingOptions> = {
            attributeWrap: "normal",
            attributeStyle: "on_different_lines",
            maxLineLength: 30,
        };
        const once = format(source, options);
        assert.equal(once, '<Widget\n    @onclick="Handle"\n    @bind-Value="Value"\n    @attributes="Attributes" />');
        assert.equal(format(once, options), once);
    });

    it("supports different-lines attribute layout and all indent modes", () => {
        assert.equal(
            format('<Widget A="1" B="2"/>', { attributeStyle: "on_different_lines" }),
            '<Widget\n    A="1"\n    B="2" />',
        );
        assert.equal(
            format('  <Widget A="1" B="2"/>', {
                attributeStyle: "on_different_lines",
                attributeIndent: "double_indent",
            }),
            '  <Widget\n          A="1"\n          B="2" />',
        );
        assert.equal(
            format('<Widget A="1" B="2"/>', {
                attributeStyle: "on_different_lines",
                attributeIndent: "align_by_first_attribute",
            }),
            '<Widget\n        A="1"\n        B="2" />',
        );
    });

    it("keeps the first attribute on the opening line when configured", () => {
        assert.equal(
            format('<Widget A="1" B="2"/>', { attributeStyle: "first_attribute_on_single_line" }),
            '<Widget A="1"\n    B="2" />',
        );
        assert.equal(
            format('<div class="root">', {
                attributeStyle: "first_attribute_on_single_line",
                spaceAfterLastAttribute: true,
            }),
            '<div class="root" >',
        );
    });

    it("limits blank lines between tags", () => {
        assert.equal(format("<div></div>\n\n\n\n<span></span>"), "<div></div>\n\n<span></span>");
        assert.equal(format("<div></div>\n\n<span></span>", { maxBlankLinesBetweenTags: 0 }), "<div></div>\n<span></span>");
    });

    it("breaks before all elements or only before multiline elements", () => {
        assert.equal(format("Text<span>Value</span>", { lineBreakBeforeAllElements: true }), "Text\n<span>Value</span>");
        assert.equal(
            format('Text<Widget A="1" B="2"/>', {
                attributeStyle: "on_different_lines",
                lineBreakBeforeMultilineElements: true,
            }),
            'Text\n<Widget\n    A="1"\n    B="2" />',
        );
    });

    it("breaks inside multiline elements and elements with child elements", () => {
        assert.equal(format("<div><span>Value</span><Widget /></div>"), "<div>\n<span>Value</span>\n<Widget />\n</div>");
        assert.equal(
            format('<div\n    class="root"\n>Text</div>', { attributeStyle: "do_not_touch" }),
            '<div\n    class="root"\n>\nText\n</div>',
        );
        assert.equal(format("<div>Prefix <span>Value</span></div>"), "<div>Prefix <span>Value</span></div>");
    });

    it("preserves spaces in all configured protected elements", () => {
        const source = "<pre>  first   value\n    second </pre>\n<textarea>  third   value </textarea>";
        assert.equal(format(source), source);
    });

    it("removes extra tag spaces without changing quoted values", () => {
        assert.equal(format('<div    class = "a   b"     id = "main"   >'), '<div class="a   b" id="main">');
    });

    it("keeps Razor attributes and quoted comparison operators intact", () => {
        assert.equal(
            format('<Widget @onclick="Handle" Visible="@(count > 0)" @attributes="Attributes"/>'),
            '<Widget @onclick="Handle" Visible="@(count > 0)" @attributes="Attributes" />',
        );
    });

    it("handles declarations, comments, boolean attributes, unquoted values, and incomplete tags safely", () => {
        const source = '<!DOCTYPE html><!-- <Fake A = "1"> --></orphan><input disabled value=test><broken';
        assert.equal(
            format(source, {
                lineBreakBeforeMultilineElements: false,
                lineBreaksInsideMultilineElements: false,
                lineBreaksInsideElementsWithChildElements: false,
            }),
            '<!DOCTYPE html><!-- <Fake A = "1"> --></orphan><input disabled value=test><broken',
        );
    });

    it("leaves element boundaries inline when all line-break rules are disabled", () => {
        assert.equal(
            format("<div><span>Value</span><Widget /></div>", {
                lineBreakBeforeAllElements: false,
                lineBreakBeforeMultilineElements: false,
                lineBreaksInsideMultilineElements: false,
                lineBreaksInsideElementsWithChildElements: false,
            }),
            "<div><span>Value</span><Widget /></div>",
        );
    });
});
