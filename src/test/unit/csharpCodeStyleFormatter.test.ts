import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CSharpNewLineOptions, CSharpSpacingOptions, CSharpWrappingOptions } from "../../core/editorConfig";
import {
    formatCSharpCodeStyle,
    type CSharpCodeStyleFormattingOptions,
    wrapCSharpLines,
} from "../../features/formatting/services/csharpCodeStyleFormatter";

const defaultNewLines: CSharpNewLineOptions = {
    beforeOpenBrace: "all",
    beforeElse: true,
    beforeCatch: true,
    beforeFinally: true,
};

const defaultSpacing: CSharpSpacingOptions = {
    afterControlFlowKeyword: true,
    aroundBinaryOperators: "before_and_after",
    afterComma: true,
    beforeComma: false,
    afterForSemicolon: true,
    beforeForSemicolon: false,
    afterCast: false,
    beforeInheritanceColon: true,
    afterInheritanceColon: true,
};

const defaultWrapping: CSharpWrappingOptions = {
    preserveSingleLineStatements: true,
    preserveSingleLineBlocks: true,
};

function format(
    source: string,
    overrides: {
        newLines?: Partial<CSharpNewLineOptions>;
        spacing?: Partial<CSharpSpacingOptions>;
        wrapping?: Partial<CSharpWrappingOptions>;
    } = {},
): string {
    const options: CSharpCodeStyleFormattingOptions = {
        indentation: { style: "space", size: 4, tabWidth: 4 },
        newLines: { ...defaultNewLines, ...overrides.newLines },
        spacing: { ...defaultSpacing, ...overrides.spacing },
        wrapping: { ...defaultWrapping, ...overrides.wrapping },
    };
    return formatCSharpCodeStyle(source, options);
}

describe("C# code-style formatting", () => {
    it("places all supported open braces on new lines", () => {
        const source = [
            "class Demo {",
            "void Run() {",
            "if(true) {",
            'Value = new Item { Name = "A" };',
            "Func<int> action = () => { return 1; };",
            "}",
            "}",
        ].join("\n");

        const result = format(source);
        assert.match(result, /class Demo\n\{/);
        assert.match(result, /void Run\(\)\n\{/);
        assert.match(result, /if \(true\)\n\{/);
        assert.match(result, /new Item\n\{/);
        assert.match(result, /=>\n\{/);
    });

    it("supports none and selected open-brace contexts", () => {
        const allman = "class Demo\n{\nvoid Run()\n{\nif (true)\n{\n}\n}\n}";
        const none = format(allman, { newLines: { beforeOpenBrace: "none" } });
        assert.match(none, /class Demo \{/);
        assert.match(none, /void Run\(\) \{/);
        assert.match(none, /if \(true\) \{/);

        const methodsOnly = format("class Demo {\nvoid Run() {\nif (true) { }\n}\n}", {
            newLines: { beforeOpenBrace: new Set(["methods"]) },
        });
        assert.match(methodsOnly, /class Demo \{/);
        assert.match(methodsOnly, /void Run\(\)\n\{/);
        assert.match(methodsOnly, /if \(true\) \{/);
    });

    it("distinguishes supported open-brace context categories", () => {
        const source = [
            "class Demo {",
            "int Value { get { return 1; } }",
            "event EventHandler Changed { add { } remove { } }",
            "int this[int index] { get { return index; } }",
            "void Run() { void Local() { } var anonymous = new { Value = 1 }; var item = new Item() { Value = 1 }; Func<int> value = () => { return 1; }; var callback = delegate { return; }; }",
            "}",
        ].join("\n");

        const accessors = format(source, { newLines: { beforeOpenBrace: new Set(["accessors"]) } });
        assert.match(accessors, /get\n\{/);
        assert.match(accessors, /add\n\{/);

        const declarations = format(source, {
            newLines: { beforeOpenBrace: new Set(["events", "indexers", "properties"]) },
        });
        assert.match(declarations, /Changed\n\{/);
        assert.match(declarations, /this\[int index\]\n\{/);
        assert.match(declarations, /int Value\n\{/);

        const expressions = format(source, {
            newLines: {
                beforeOpenBrace: new Set([
                    "anonymous_methods",
                    "anonymous_types",
                    "lambdas",
                    "object_collection_array_initializers",
                ]),
            },
        });
        assert.match(expressions, /new\n\{/);
        assert.match(expressions, /new Item\(\)\n\{/);
        assert.match(expressions, /=>\n\{/);
        assert.match(expressions, /delegate\n\{/);

        const initializers = format("var item = new() { Value = 1 }; var values = new[] { 1, 2 };", {
            newLines: { beforeOpenBrace: new Set(["object_collection_array_initializers"]) },
        });
        assert.match(initializers, /new\(\)\n\{/);
        assert.match(initializers, /new\[\]\n\{/);

        const functions = format(source, {
            newLines: { beforeOpenBrace: new Set(["local_functions"]) },
        });
        assert.match(functions, /void Run\(\) \{/);
        assert.match(functions, /void Local\(\)\n\{/);
    });

    it("formats else, catch, and finally on new or same lines", () => {
        const sameLine = "if (ready) { Work(); } else { Stop(); }\ntry { Work(); } catch (Exception) { } finally { }";
        const newLines = format(sameLine);
        assert.match(newLines, /}\nelse/);
        assert.match(newLines, /}\ncatch/);
        assert.match(newLines, /}\nfinally/);
        assert.match(format("if (ready) { }else { }"), /}\nelse/);

        const separateLines = "if (ready) { }\nelse { }\ntry { }\ncatch (Exception) { }\nfinally { }";
        const joined = format(separateLines, {
            newLines: { beforeElse: false, beforeCatch: false, beforeFinally: false },
        });
        assert.match(joined, /} else/);
        assert.match(joined, /} catch/);
        assert.match(joined, /} finally/);
    });

    it("formats control-flow keywords, commas, casts, inheritance colons, and for semicolons", () => {
        const source = "class Demo:IThing,IOther { void Run(){ for(int i=0 ;i<10 ;i++){ Use((Item) value,a , b); } } }";
        const result = format(source);
        assert.match(result, /class Demo : IThing, IOther/);
        assert.match(result, /for \(int i=0; i < 10; i\+\+\)/);
        assert.match(result, /Use\(\(Item\)value, a, b\)/);

        const compact = format(source, {
            spacing: {
                afterControlFlowKeyword: false,
                afterComma: false,
                beforeComma: true,
                afterForSemicolon: false,
                beforeForSemicolon: true,
                afterCast: true,
                beforeInheritanceColon: false,
                afterInheritanceColon: false,
            },
        });
        assert.match(compact, /class Demo:IThing ,IOther/);
        assert.match(compact, /for\(int i=0 ;i < 10 ;i\+\+\)/);
        assert.match(compact, /\(Item\) value ,a ,b/);
    });

    it("formats binary operators without changing unary operators or generic arguments", () => {
        const source = "List<string> values = left+right*2; value=-value; index++; if(a<b&&b>c&&a<=c&&b!=c) { }";
        const spaced = format(source);
        assert.match(spaced, /List<string>/);
        assert.match(spaced, /left \+ right \* 2/);
        assert.match(spaced, /value=-value/);
        assert.match(spaced, /index\+\+/);
        assert.match(spaced, /a < b && b > c && a <= c && b != c/);

        const compact = format("result = left + right && ready;", {
            spacing: { aroundBinaryOperators: "none" },
        });
        assert.match(compact, /left\+right&&ready/);

        const ignored = format("result = left  +right;", {
            spacing: { aroundBinaryOperators: "ignore" },
        });
        assert.match(ignored, /left  \+right/);
    });

    it("preserves strings, characters, raw strings, and comments", () => {
        const source = [
            'var regular = "if(a+b, c); { }"; // if(a+b){x;y;}',
            'var verbatim = @"a+b,; { }";',
            'var raw = """if(a+b, c); { }""";',
            "var character = '+'; /* if(a+b){x;y;} */",
        ].join("\n");

        const result = format(source, {
            wrapping: { preserveSingleLineStatements: false, preserveSingleLineBlocks: false },
        });
        assert.match(result, /\"if\(a\+b, c\); \{ \}\"/);
        assert.match(result, /\/\/ if\(a\+b\)\{x;y;\}/);
        assert.match(result, /@\"a\+b,; \{ \}\"/);
        assert.match(result, /\"\"\"if\(a\+b, c\); \{ \}\"\"\"/);
        assert.match(result, /'\+'/);
        assert.match(result, /\/\* if\(a\+b\)\{x;y;\} \*\//);
    });

    it("splits statements and blocks while preserving for headers and initializers", () => {
        const source =
            'void Run(){ int a=1; int b=2; for(int i=0;i<2;i++){ Work(); Next(); } if(a<b) { Use(); } }\nvar item = new Item { Name = "A" };';
        const result = format(source, {
            wrapping: { preserveSingleLineStatements: false, preserveSingleLineBlocks: false },
        });
        assert.match(result, /void Run\(\)\n\{\nint a=1;\nint b=2;/);
        assert.match(result, /for \(int i=0; i < 2; i\+\+\)\n\{\nWork\(\);\nNext\(\);\n\}/);
        assert.match(result, /}\nif \(a < b\)/);
        assert.match(result, /new Item\n\{ Name = \"A\" \}/);
    });

    it("preserves single-line statements and blocks when enabled", () => {
        const source = "void Run() { int a=1; int b=2; }";
        const result = format(source, { newLines: { beforeOpenBrace: "none" } });
        assert.equal(result, source);
    });

    it("keeps CRLF when inserting configured new lines", () => {
        const result = format("class Demo {\r\nvoid Run() { }\r\n}");
        assert.ok(result.includes("class Demo\r\n{"));
        assert.equal(result.replace(/\r\n/g, "").includes("\n"), false);
    });

    it("wraps long C# lines at commas and binary operators", () => {
        const indentation = { style: "space" as const, size: 4, tabWidth: 4 };
        const invocation = wrapCSharpLines(
            "var result = Calculate(firstArgument, secondArgument, thirdArgument);",
            44,
            indentation,
        );
        assert.equal(invocation, "var result = Calculate(firstArgument,\n    secondArgument, thirdArgument);");

        const expression = wrapCSharpLines("var result = firstValue + secondValue + thirdValue;", 34, indentation);
        assert.equal(expression, "var result = firstValue\n    + secondValue + thirdValue;");
    });

    it("leaves disabled, protected, preprocessor, and unbreakable lines unchanged", () => {
        const indentation = { style: "space" as const, size: 4, tabWidth: 4 };
        const source = 'var message = "first, second + third"; // fourth, fifth + sixth';
        assert.equal(wrapCSharpLines(source, undefined, indentation), source);
        assert.equal(wrapCSharpLines(source, 20, indentation), source);
        assert.equal(
            wrapCSharpLines("#define A_VERY_LONG_PREPROCESSOR_SYMBOL", 10, indentation),
            "#define A_VERY_LONG_PREPROCESSOR_SYMBOL",
        );
        assert.equal(
            wrapCSharpLines("VeryLongIdentifierWithoutSafeBreakPoint", 10, indentation),
            "VeryLongIdentifierWithoutSafeBreakPoint",
        );
    });

    it("uses tab_width when measuring and indenting continuation lines", () => {
        const result = wrapCSharpLines("\tCall(firstArgument, secondArgument, thirdArgument);", 32, {
            style: "tab",
            size: 4,
            tabWidth: 4,
        });
        assert.equal(result, "\tCall(firstArgument,\n\t\tsecondArgument,\n\t\tthirdArgument);");
    });
});
