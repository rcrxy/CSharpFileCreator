import type { Charset, IndentationOptions, LineEnding } from "../../../core/editorConfig";
import { formatDocumentText } from "./documentTextFormatter";

export interface RazorFormattingOptions {
    readonly indentation: IndentationOptions;
    readonly lineEnding: LineEnding;
    readonly insertFinalNewline: boolean;
    readonly trimTrailingWhitespace: boolean;
    readonly charset: Charset;
    readonly formatCSharp?: (source: string) => string;
}

const voidElementNames = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

const optionalEndElementNames = new Set(["dd", "dt", "li", "option", "p", "tbody", "td", "tfoot", "th", "thead", "tr"]);

const protectedElementPattern = /^<(script|style|pre|textarea)\b/i;
const razorCodeBlockPattern = /^@(?:code|functions)\b|^@\s*\{/i;

interface TagToken {
    readonly kind: "open" | "close" | "neutral";
    readonly name?: string;
    readonly start: number;
    readonly end: number;
}

interface CSharpLexicalState {
    mode: "normal" | "blockComment" | "regularString" | "verbatimString" | "char" | "rawString";
    rawQuoteCount: number;
}

interface RazorCodeBlockState {
    depth: number;
    seenOpeningBrace: boolean;
    lexicalState: CSharpLexicalState;
}

interface BraceScanResult {
    readonly delta: number;
    readonly sawOpeningBrace: boolean;
}

interface MultilineOpeningTagState {
    readonly name: string;
}

export function formatRazorMarkup(source: string, options: RazorFormattingOptions): string {
    const sourceWithFormattedCSharp = options.formatCSharp
        ? formatRazorCodeBlocks(source, options.indentation, options.formatCSharp)
        : source;
    const separators = sourceWithFormattedCSharp.match(/\r\n|\n|\r/g) ?? [];
    const lines = sourceWithFormattedCSharp.split(/\r\n|\n|\r/);
    const formattedLines = formatLines(lines, options.indentation);
    const formatted = formattedLines.reduce((result, line, index) => {
        return result + line + (separators[index] ?? "");
    }, "");

    return formatDocumentText(formatted, options);
}

function formatRazorCodeBlocks(
    source: string,
    indentation: IndentationOptions,
    formatCSharp: (source: string) => string,
): string {
    const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r\n|\n|\r/);
    const indentUnit = indentation.style === "tab" ? "\t" : " ".repeat(indentation.size);

    for (let directiveLine = 0; directiveLine < lines.length; directiveLine++) {
        if (!razorCodeBlockPattern.test(lines[directiveLine].trim())) {
            continue;
        }

        const state = createRazorCodeBlockState();
        let openingLine = -1;
        let closingLine = -1;

        for (let lineIndex = directiveLine; lineIndex < lines.length; lineIndex++) {
            const braceScan = scanCSharpBraces(lines[lineIndex], state.lexicalState);
            state.depth += braceScan.delta;
            if (braceScan.sawOpeningBrace && !state.seenOpeningBrace) {
                state.seenOpeningBrace = true;
                openingLine = lineIndex;
            }

            if (state.seenOpeningBrace && state.depth <= 0) {
                closingLine = lineIndex;
                break;
            }
        }

        if (openingLine < 0 || closingLine <= openingLine + 1) {
            directiveLine = Math.max(directiveLine, closingLine);
            continue;
        }

        const baseIndent = getLeadingWhitespace(lines[directiveLine]);
        const csharpSource = lines.slice(openingLine + 1, closingLine).join(lineEnding);
        const formattedCSharp = formatCSharp(csharpSource).split(/\r\n|\n|\r/);
        const indentedCSharp = formattedCSharp.map(line => {
            return line.trim().length === 0 ? "" : baseIndent + indentUnit + line;
        });

        lines.splice(openingLine + 1, closingLine - openingLine - 1, ...indentedCSharp);
        directiveLine = openingLine + indentedCSharp.length + 1;
    }

    return lines.join(lineEnding);
}

function formatLines(lines: readonly string[], indentation: IndentationOptions): string[] {
    const result: string[] = [];
    const markupStack: string[] = [];
    const indentUnit = indentation.style === "tab" ? "\t" : " ".repeat(indentation.size);
    let baseIndent = "";
    let inRazorComment = false;
    let inHtmlComment = false;
    let protectedElementName: string | undefined;
    let codeBlock: RazorCodeBlockState | undefined;
    let multilineOpeningTag: MultilineOpeningTagState | undefined;

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (multilineOpeningTag) {
            if (trimmedLine.length === 0) {
                result.push(line);
                continue;
            }

            result.push(baseIndent + indentUnit.repeat(markupStack.length + 1) + trimmedLine);

            const tagEnd = findTagEnd(trimmedLine, 0);
            if (tagEnd >= 0) {
                if (!isSelfClosingTagLine(trimmedLine, tagEnd)) {
                    markupStack.push(multilineOpeningTag.name);
                }
                multilineOpeningTag = undefined;
            }
            continue;
        }

        if (codeBlock) {
            codeBlock = updateRazorCodeBlock(codeBlock, line);
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (inRazorComment) {
            inRazorComment = !line.includes("*@");
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (inHtmlComment) {
            inHtmlComment = !line.includes("-->");
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (protectedElementName) {
            if (new RegExp(`</${protectedElementName}\\s*>`, "i").test(line)) {
                protectedElementName = undefined;
            }
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (razorCodeBlockPattern.test(trimmedLine)) {
            codeBlock = updateRazorCodeBlock(createRazorCodeBlockState(), line);
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (line.includes("@*")) {
            inRazorComment = !line.includes("*@", line.indexOf("@*") + 2);
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (line.includes("<!--")) {
            inHtmlComment = !line.includes("-->", line.indexOf("<!--") + 4);
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        const protectedElementMatch = protectedElementPattern.exec(trimmedLine);
        if (protectedElementMatch) {
            const elementName = protectedElementMatch[1];
            if (!new RegExp(`</${elementName}\\s*>`, "i").test(trimmedLine)) {
                protectedElementName = elementName;
            }
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (isFormattingBoundary(trimmedLine)) {
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (trimmedLine.length === 0) {
            result.push(line);
            continue;
        }

        const multilineTagName = getMultilineOpeningTagName(trimmedLine);
        if (multilineTagName) {
            if (markupStack.length === 0) {
                baseIndent = getLeadingWhitespace(line);
            }

            result.push(baseIndent + indentUnit.repeat(markupStack.length) + trimmedLine);
            multilineOpeningTag = { name: multilineTagName };
            continue;
        }

        const tokens = parseTagTokens(trimmedLine);
        if (!tokens) {
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        if (tokens.length === 0) {
            if (markupStack.length === 0) {
                result.push(line);
                continue;
            }

            result.push(baseIndent + indentUnit.repeat(markupStack.length) + trimmedLine);
            continue;
        }

        if (markupStack.length === 0 && tokens[0].start > 0) {
            result.push(line);
            continue;
        }

        if (markupStack.length === 0) {
            baseIndent = getLeadingWhitespace(line);
        }

        const nextStack = applyTagTokens(markupStack, tokens, trimmedLine);
        if (!nextStack) {
            resetMarkupState(markupStack);
            result.push(line);
            continue;
        }

        const leadingClosingCount = countLeadingClosingTags(tokens, trimmedLine);
        const lineDepth = Math.max(0, markupStack.length - leadingClosingCount);
        result.push(baseIndent + indentUnit.repeat(lineDepth) + trimmedLine);
        markupStack.splice(0, markupStack.length, ...nextStack);

        if (markupStack.length === 0) {
            baseIndent = "";
        }
    }

    return result;
}

function parseTagTokens(line: string): TagToken[] | undefined {
    const tokens: TagToken[] = [];
    let cursor = 0;

    while (cursor < line.length) {
        const start = line.indexOf("<", cursor);
        if (start < 0) {
            break;
        }

        if (line.startsWith("<!--", start)) {
            const commentEnd = line.indexOf("-->", start + 4);
            if (commentEnd < 0) {
                return undefined;
            }
            tokens.push({ kind: "neutral", start, end: commentEnd + 3 });
            cursor = commentEnd + 3;
            continue;
        }

        const end = findTagEnd(line, start + 1);
        if (end < 0) {
            return undefined;
        }

        const body = line.slice(start + 1, end).trim();
        const token = createTagToken(body, start, end + 1);
        if (!token) {
            return undefined;
        }

        tokens.push(token);
        cursor = end + 1;
    }

    return tokens;
}

function createTagToken(body: string, start: number, end: number): TagToken | undefined {
    if (body.startsWith("!") || body.startsWith("?")) {
        return { kind: "neutral", start, end };
    }

    const closingMatch = /^\/\s*([A-Za-z][\w:.-]*)\s*$/.exec(body);
    if (closingMatch) {
        return { kind: "close", name: closingMatch[1], start, end };
    }

    const openingMatch = /^([A-Za-z][\w:.-]*)\b/.exec(body);
    if (!openingMatch) {
        return undefined;
    }

    const name = openingMatch[1];
    const normalizedName = name.toLowerCase();
    const isNeutral = body.endsWith("/") || voidElementNames.has(normalizedName);
    return { kind: isNeutral ? "neutral" : "open", name, start, end };
}

function applyTagTokens(currentStack: readonly string[], tokens: readonly TagToken[], line: string): string[] | undefined {
    const nextStack = [...currentStack];

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.kind === "neutral") {
            continue;
        }

        if (token.kind === "open") {
            if (isAmbiguousOptionalElement(token, tokens, index)) {
                return undefined;
            }
            nextStack.push(token.name!);
            continue;
        }

        const openingName = nextStack.pop();
        if (!openingName || openingName !== token.name) {
            return undefined;
        }
    }

    const lastTokenEnd = tokens.at(-1)?.end ?? 0;
    if (line.slice(lastTokenEnd).includes("<")) {
        return undefined;
    }

    return nextStack;
}

function isAmbiguousOptionalElement(token: TagToken, tokens: readonly TagToken[], tokenIndex: number): boolean {
    const normalizedName = token.name!.toLowerCase();
    if (!optionalEndElementNames.has(normalizedName)) {
        return false;
    }

    return !tokens.slice(tokenIndex + 1).some(candidate => {
        return candidate.kind === "close" && candidate.name === token.name;
    });
}

function countLeadingClosingTags(tokens: readonly TagToken[], line: string): number {
    let count = 0;
    let cursor = 0;

    for (const token of tokens) {
        if (line.slice(cursor, token.start).trim().length > 0 || token.kind !== "close") {
            break;
        }
        count++;
        cursor = token.end;
    }

    return count;
}

function findTagEnd(line: string, start: number): number {
    let quote: '"' | "'" | undefined;

    for (let index = start; index < line.length; index++) {
        const character = line[index];
        if (quote) {
            if (character === quote) {
                quote = undefined;
            }
            continue;
        }

        if (character === '"' || character === "'") {
            quote = character;
        } else if (character === ">") {
            return index;
        }
    }

    return -1;
}

function getMultilineOpeningTagName(line: string): string | undefined {
    if (findTagEnd(line, 1) >= 0) {
        return undefined;
    }

    return /^<([A-Za-z][\w:.-]*)\b/.exec(line)?.[1];
}

function isSelfClosingTagLine(line: string, tagEnd: number): boolean {
    return line.slice(0, tagEnd).trimEnd().endsWith("/");
}

function isFormattingBoundary(trimmedLine: string): boolean {
    return trimmedLine.startsWith("@") || trimmedLine.startsWith("{") || trimmedLine.startsWith("}");
}

function getLeadingWhitespace(line: string): string {
    return /^\s*/.exec(line)?.[0] ?? "";
}

function resetMarkupState(markupStack: string[]): void {
    markupStack.length = 0;
}

function createRazorCodeBlockState(): RazorCodeBlockState {
    return {
        depth: 0,
        seenOpeningBrace: false,
        lexicalState: { mode: "normal", rawQuoteCount: 0 },
    };
}

function updateRazorCodeBlock(state: RazorCodeBlockState, line: string): RazorCodeBlockState | undefined {
    const braceScan = scanCSharpBraces(line, state.lexicalState);
    state.depth += braceScan.delta;
    state.seenOpeningBrace ||= braceScan.sawOpeningBrace;

    return state.seenOpeningBrace && state.depth <= 0 ? undefined : state;
}

function scanCSharpBraces(line: string, state: CSharpLexicalState): BraceScanResult {
    let delta = 0;
    let sawOpeningBrace = false;

    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (state.mode === "blockComment") {
            if (character === "*" && nextCharacter === "/") {
                state.mode = "normal";
                index++;
            }
            continue;
        }

        if (state.mode === "rawString") {
            if (character === '"' && countRun(line, index, '"') >= state.rawQuoteCount) {
                index += state.rawQuoteCount - 1;
                state.mode = "normal";
            }
            continue;
        }

        if (state.mode === "verbatimString") {
            if (character === '"' && nextCharacter === '"') {
                index++;
            } else if (character === '"') {
                state.mode = "normal";
            }
            continue;
        }

        if (state.mode === "regularString" || state.mode === "char") {
            if (character === "\\") {
                index++;
            } else if ((state.mode === "regularString" && character === '"') || (state.mode === "char" && character === "'")) {
                state.mode = "normal";
            }
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            break;
        }
        if (character === "/" && nextCharacter === "*") {
            state.mode = "blockComment";
            index++;
            continue;
        }

        const quoteCount = character === '"' ? countRun(line, index, '"') : 0;
        if (quoteCount >= 3) {
            state.mode = "rawString";
            state.rawQuoteCount = quoteCount;
            index += quoteCount - 1;
        } else if (character === "@" && nextCharacter === '"') {
            state.mode = "verbatimString";
            index++;
        } else if (character === '"') {
            state.mode = "regularString";
        } else if (character === "'") {
            state.mode = "char";
        } else if (character === "{") {
            delta++;
            sawOpeningBrace = true;
        } else if (character === "}") {
            delta--;
        }
    }

    if (state.mode === "regularString" || state.mode === "char") {
        state.mode = "normal";
    }

    return { delta, sawOpeningBrace };
}

function countRun(line: string, start: number, character: string): number {
    let count = 0;
    while (line[start + count] === character) {
        count++;
    }
    return count;
}
