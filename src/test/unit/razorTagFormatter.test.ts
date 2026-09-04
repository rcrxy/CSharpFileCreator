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

    it("supports different-lines attribute layout and all indent modes", () => {
        assert.equal(
            format('<Widget A="1" B="2"/>', { attributeStyle: "on_different_lines" }),
            '<Widget\n    A="1"\n    B="2"\n/>',
        );
        assert.equal(
            format('  <Widget A="1" B="2"/>', {
                attributeStyle: "on_different_lines",
                attributeIndent: "double_indent",
            }),
            '  <Widget\n          A="1"\n          B="2"\n  />',
        );
        assert.equal(
            format('<Widget A="1" B="2"/>', {
                attributeStyle: "on_different_lines",
                attributeIndent: "align_by_first_attribute",
            }),
            '<Widget\n        A="1"\n        B="2"\n/>',
        );
    });

    it("keeps the first attribute on the opening line when configured", () => {
        assert.equal(
            format('<Widget A="1" B="2"/>', { attributeStyle: "first_attribute_on_single_line" }),
            '<Widget A="1"\n    B="2"\n/>',
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
            'Text\n<Widget\n    A="1"\n    B="2"\n/>',
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
