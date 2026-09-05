import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CSharpIndentationOptions } from "../../core/editorConfig";
import { wrapCSharpLines } from "../../features/formatting/services/csharpCodeStyleFormatter";
import { formatCSharpIndentation } from "../../features/formatting/services/csharpIndentationFormatter";

const indentationOptions: CSharpIndentationOptions = {
    indentBlockContents: true,
    indentBraces: false,
    indentCaseContents: true,
    indentSwitchLabels: true,
    indentCaseContentsWhenBlock: true,
    indentLabels: "one_less_than_current",
};

function format(source: string): string {
    return formatCSharpIndentation(source, {
        indentation: { style: "space", size: 4, tabWidth: 4 },
        csharpIndentation: indentationOptions,
    });
}

describe("C# embedded statement indentation", () => {
    it("indents an if body without braces and restores the following statement", () => {
        const source = [
            "class Demo",
            "{",
            "void Run()",
            "{",
            "if (_stores.Count > 0)",
            "_selectedStores = [_stores.FirstOrDefault()!];",
            "Continue();",
            "}",
            "}",
        ].join("\n");

        const result = format(source);
        assert.match(result, /^        if \(_stores.Count > 0\)$/m);
        assert.match(result, /^            _selectedStores = \[_stores.FirstOrDefault\(\)!\];$/m);
        assert.match(result, /^        Continue\(\);$/m);
    });

    it("adds one level for each nested unbraced control statement", () => {
        const result = format("void Run()\n{\nif (ready)\nwhile (pending)\nWork();\nContinue();\n}");
        assert.match(result, /^    if \(ready\)$/m);
        assert.match(result, /^        while \(pending\)$/m);
        assert.match(result, /^            Work\(\);$/m);
        assert.match(result, /^    Continue\(\);$/m);
    });

    it("supports else, do, for, foreach, using, lock, and fixed embedded statements", () => {
        const source = [
            "void Run()",
            "{",
            "else",
            "Stop();",
            "do",
            "Work();",
            "for (var index = 0; index < 1; index++)",
            "Work();",
            "foreach (var item in items)",
            "Use(item);",
            "using (resource)",
            "Use(resource);",
            "lock (gate)",
            "Work();",
            "fixed (byte* pointer = buffer)",
            "Use(pointer);",
            "}",
        ].join("\n");

        const result = format(source);
        for (const statement of ["Stop();", "Work();", "Use(item);", "Use(resource);", "Use(pointer);"]) {
            assert.match(result, new RegExp(`^        ${statement.replace(/[()]/g, "\\$&")}$`, "m"));
        }
    });

    it("does not treat an Allman brace as an unbraced statement body", () => {
        const result = format("void Run()\n{\nif (ready)\n{\nWork();\n}\nContinue();\n}");
        assert.match(result, /^    \{$/m);
        assert.match(result, /^        Work\(\);$/m);
        assert.match(result, /^    Continue\(\);$/m);
    });

    it("keeps comments between the control header and body without consuming the body indent", () => {
        const result = format("void Run()\n{\nif (ready)\n// explanation\nWork();\nContinue();\n}");
        assert.match(result, /^        \/\/ explanation$/m);
        assert.match(result, /^        Work\(\);$/m);
        assert.match(result, /^    Continue\(\);$/m);
    });

    it("indents multiline method arguments and restores the closing delimiter", () => {
        const source = [
            "void Run()",
            "{",
            "var dialog = DialogService.OpenAsync<StoreEditDialog>(",
            '"新建店铺", parameters: null,',
            'options: new DialogOptions { Width = "420px" });',
            "retry:",
            "Continue();",
            "}",
        ].join("\n");

        const result = format(source);
        assert.match(result, /^        "新建店铺", parameters: null,$/m);
        assert.match(result, /^        options: new DialogOptions \{ Width = "420px" \}\);$/m);
        assert.match(result, /^retry:$/m);
        assert.match(result, /^    Continue\(\);$/m);
    });

    it("keeps automatically wrapped named arguments stable across formatting passes", () => {
        const source = [
            "void Run()",
            "{",
            'var dialog = DialogService.OpenAsync<StoreEditDialog>("新建店铺", parameters: null, options: new DialogOptions { Width = "420px" });',
            "}",
        ].join("\n");
        const indentation = { style: "space" as const, size: 4, tabWidth: 4 };
        const formatAndWrap = (value: string) => wrapCSharpLines(format(value), 90, indentation);

        const once = formatAndWrap(source);
        const twice = formatAndWrap(once);

        assert.match(once, /^        options: new DialogOptions \{ Width = "420px" \}\);$/m);
        assert.equal(twice, once);
    });
});
