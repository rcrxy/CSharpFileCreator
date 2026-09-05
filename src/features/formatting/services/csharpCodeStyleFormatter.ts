import type {
    CSharpNewLineOptions,
    CSharpOpenBraceContext,
    CSharpSpacingOptions,
    CSharpWrappingOptions,
    IndentationOptions,
} from "../../../core/editorConfig";
import { csharpKeywords } from "../../../shared/csharp/csharpKeywords";

export interface CSharpCodeStyleFormattingOptions {
    readonly indentation: IndentationOptions;
    readonly newLines: CSharpNewLineOptions;
    readonly spacing: CSharpSpacingOptions;
    readonly wrapping: CSharpWrappingOptions;
}

type LexicalMode = "normal" | "blockComment" | "regularString" | "verbatimString" | "char" | "rawString";

interface LexicalState {
    mode: LexicalMode;
    rawQuoteCount: number;
}

const controlFlowKeywords = ["if", "for", "foreach", "while", "switch", "catch", "using", "lock", "fixed"];
const binaryOperatorPattern =
    /(\?\?=|<<=|>>>=|>>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\?\?|&&|\|\||==|!=|<=|>=|>>>|<<|>>|[+\-*/%&|^<>])/g;

/**
 * 格式化 C# 换行、空格与单行保留规则，不负责最终层级缩进。
 */
export function formatCSharpCodeStyle(source: string, options: CSharpCodeStyleFormattingOptions): string {
    const lineEnding = detectLineEnding(source);
    let formatted = source;

    if (!options.wrapping.preserveSingleLineBlocks) {
        formatted = expandSingleLineBlocks(formatted, lineEnding);
    }
    if (!options.wrapping.preserveSingleLineStatements) {
        formatted = splitSingleLineStatements(formatted, lineEnding);
    }

    formatted = formatOpenBraceNewLines(formatted, options.newLines.beforeOpenBrace, lineEnding);
    formatted = formatKeywordNewLines(formatted, "else", options.newLines.beforeElse, lineEnding);
    formatted = formatKeywordNewLines(formatted, "catch", options.newLines.beforeCatch, lineEnding);
    formatted = formatKeywordNewLines(formatted, "finally", options.newLines.beforeFinally, lineEnding);
    formatted = formatSpacing(formatted, options.spacing);
    formatted = formatInitializerMemberNewLines(formatted, options.newLines, lineEnding);
    formatted = formatQueryExpressionClauseNewLines(
        formatted,
        options.newLines.betweenQueryExpressionClauses,
        lineEnding,
    );

    return formatted;
}

/**
 * 在逗号和二元运算符等安全边界处限制 C# 行宽；没有安全断点的长行保持不变。
 */
export function wrapCSharpLines(
    source: string,
    maxLineLength: number | undefined,
    indentation: IndentationOptions,
): string {
    if (!maxLineLength) {
        return source;
    }

    const indentUnit = indentation.style === "tab" ? "\t" : " ".repeat(indentation.size);
    const lineEnding = detectLineEnding(source);
    return splitLinesWithEndings(source)
        .map(line => wrapCSharpLine(line.content, maxLineLength, indentUnit, indentation.tabWidth).join(lineEnding) + line.ending)
        .join("");
}

interface LineBreakCandidate {
    readonly index: number;
    readonly placement: "after" | "before";
}

function wrapCSharpLine(content: string, maxLineLength: number, indentUnit: string, tabWidth: number): string[] {
    if (visualLength(content, tabWidth) <= maxLineLength || content.trimStart().startsWith("#")) {
        return [content];
    }

    const leadingWhitespace = /^\s*/.exec(content)?.[0] ?? "";
    const continuationIndent = leadingWhitespace + indentUnit;
    const result: string[] = [];
    let remaining = content;

    while (visualLength(remaining, tabWidth) > maxLineLength) {
        const candidate = chooseLineBreakCandidate(remaining, maxLineLength, tabWidth);
        if (!candidate) {
            break;
        }

        const splitIndex = candidate.placement === "after" ? candidate.index + 1 : candidate.index;
        const before = remaining.slice(0, splitIndex).trimEnd();
        const after = remaining.slice(splitIndex).trimStart();
        if (!before || !after) {
            break;
        }

        result.push(before);
        remaining = continuationIndent + after;
    }

    result.push(remaining);
    return result;
}

function chooseLineBreakCandidate(
    line: string,
    maxLineLength: number,
    tabWidth: number,
): LineBreakCandidate | undefined {
    const candidates = findLineBreakCandidates(line);
    const candidatesBeforeLimit = candidates.filter(candidate => {
        const splitIndex = candidate.placement === "after" ? candidate.index + 1 : candidate.index;
        return visualLength(line.slice(0, splitIndex), tabWidth) <= maxLineLength;
    });

    return candidatesBeforeLimit.at(-1) ?? candidates[0];
}

function findLineBreakCandidates(line: string): LineBreakCandidate[] {
    const mask = createCodeMask(line);
    const candidates: LineBreakCandidate[] = [];

    for (let index = 0; index < line.length; index++) {
        if (line[index] === "," && mask[index]) {
            candidates.push({ index, placement: "after" });
        }
    }

    for (const match of line.matchAll(binaryOperatorPattern)) {
        if (mask[match.index] && !isUnaryOrNonBinaryOperator(line, match.index, match[0])) {
            candidates.push({ index: match.index, placement: "before" });
        }
    }

    return candidates.sort((left, right) => left.index - right.index);
}

function visualLength(value: string, tabWidth: number): number {
    let column = 0;
    for (const character of value) {
        column += character === "\t" ? tabWidth - (column % tabWidth) : 1;
    }
    return column;
}

function formatSpacing(source: string, options: CSharpSpacingOptions): string {
    let formatted = source;
    const keywordPattern = new RegExp(`\\b(${controlFlowKeywords.join("|")})[ \\t]*\\(`, "g");
    formatted = replaceCodeMatches(formatted, keywordPattern, match => {
        const keyword = /^\w+/.exec(match)?.[0] ?? match;
        return `${keyword}${options.afterControlFlowKeyword ? " " : ""}(`;
    });
    formatted = replaceCodeMatches(formatted, /[ \t]*,[ \t]*/g, () => {
        return `${options.beforeComma ? " " : ""},${options.afterComma ? " " : ""}`;
    });
    formatted = formatForSemicolons(formatted, options);
    formatted = formatCastSpacing(formatted, options.afterCast);
    formatted = formatInheritanceColonSpacing(formatted, options);

    if (options.aroundBinaryOperators !== "ignore") {
        formatted = formatBinaryOperatorSpacing(formatted, options.aroundBinaryOperators === "before_and_after");
    }

    formatted = formatParenthesisSpacing(formatted, options);

    return formatted;
}

type SpacingParenthesisKind = "control_flow" | "expression" | "method_call" | "method_declaration" | "type_cast";

interface ParenthesisPair {
    readonly openingIndex: number;
    readonly closingIndex: number;
}

interface CallableBeforeParenthesis {
    readonly name: string;
    readonly nameStart: number;
    readonly gapStart: number;
}

function formatParenthesisSpacing(source: string, options: CSharpSpacingOptions): string {
    const mask = createCodeMask(source);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (const pair of findParenthesisPairs(source, mask)) {
        const kind = classifySpacingParenthesis(source, mask, pair);
        if (!kind) {
            continue;
        }

        const callable =
            kind === "method_call" || kind === "method_declaration"
                ? findCallableBeforeParenthesis(source, pair.openingIndex)
                : undefined;
        if (callable) {
            const useNameSpace =
                kind === "method_call"
                    ? options.betweenMethodCallNameAndOpeningParenthesis
                    : options.betweenMethodDeclarationNameAndOpeningParenthesis;
            replacements.push({
                start: callable.gapStart,
                end: pair.openingIndex,
                value: useNameSpace ? " " : "",
            });
        }

        const empty = source.slice(pair.openingIndex + 1, pair.closingIndex).trim().length === 0;
        let useInnerSpaces: boolean;
        if (kind === "method_call") {
            useInnerSpaces = empty
                ? options.betweenMethodCallEmptyParameterListParentheses
                : options.betweenMethodCallParameterListParentheses;
        } else if (kind === "method_declaration") {
            useInnerSpaces = empty
                ? options.betweenMethodDeclarationEmptyParameterListParentheses
                : options.betweenMethodDeclarationParameterListParentheses;
        } else {
            const context =
                kind === "control_flow" ? "control_flow_statements" : kind === "expression" ? "expressions" : "type_casts";
            useInnerSpaces = options.betweenParentheses.has(context);
        }

        addInnerParenthesisSpacingReplacements(source, pair, useInnerSpaces, replacements);
    }

    return applyReplacements(source, replacements);
}

function findParenthesisPairs(source: string, mask: readonly boolean[]): ParenthesisPair[] {
    const stack: number[] = [];
    const pairs: ParenthesisPair[] = [];

    for (let index = 0; index < source.length; index++) {
        if (!mask[index]) {
            continue;
        }
        if (source[index] === "(") {
            stack.push(index);
        } else if (source[index] === ")" && stack.length > 0) {
            pairs.push({ openingIndex: stack.pop()!, closingIndex: index });
        }
    }

    return pairs.sort((left, right) => left.openingIndex - right.openingIndex);
}

function classifySpacingParenthesis(
    source: string,
    mask: readonly boolean[],
    pair: ParenthesisPair,
): SpacingParenthesisKind | undefined {
    const previousWord = previousCodeWord(source, pair.openingIndex);
    if (previousWord && controlFlowKeywords.includes(previousWord)) {
        return "control_flow";
    }
    if (isCastParenthesis(source, pair)) {
        return "type_cast";
    }

    const callable = findCallableBeforeParenthesis(source, pair.openingIndex);
    if (
        callable &&
        !isNonInvocationKeyword(callable.name) &&
        !isObjectCreation(source, callable.nameStart) &&
        !isConstructorInitializer(source, callable.nameStart, callable.name) &&
        !isDelegateDeclaration(source, callable.nameStart)
    ) {
        return isMethodDeclaration(source, callable, pair.closingIndex) ? "method_declaration" : "method_call";
    }

    return isParenthesizedExpression(source, mask, pair) ? "expression" : undefined;
}

function findCallableBeforeParenthesis(source: string, openingIndex: number): CallableBeforeParenthesis | undefined {
    const gapStart = findHorizontalWhitespaceStart(source, openingIndex);
    const match = /([A-Za-z_]\w*)(?:\s*<[^()\r\n{};]+>)?$/.exec(source.slice(0, gapStart));
    if (!match) {
        return undefined;
    }

    return {
        name: match[1],
        nameStart: match.index,
        gapStart,
    };
}

function isMethodDeclaration(source: string, callable: CallableBeforeParenthesis, closingIndex: number): boolean {
    const previousCharacter = previousNonWhitespace(source, callable.nameStart - 1);
    if (previousCharacter === "?") {
        return false;
    }

    const boundary = Math.max(
        source.lastIndexOf(";", callable.nameStart - 1),
        source.lastIndexOf("{", callable.nameStart - 1),
        source.lastIndexOf("}", callable.nameStart - 1),
    );
    let prefix = source.slice(boundary + 1, callable.nameStart).trim();
    prefix = prefix.replace(/^(?:\[[^\]\r\n]*\]\s*)+/, "");
    prefix = prefix.replace(
        /^(?:(?:public|private|protected|internal|static|abstract|virtual|override|sealed|extern|async|unsafe|new|partial|readonly|required|file|ref|scoped)\s+)*/,
        "",
    );

    const suffix = source.slice(closingIndex + 1).trimStart();
    if (!/^(?:\{|=>|:|;|where\b)/.test(suffix)) {
        return false;
    }
    if (previousCharacter === "~") {
        return suffix.startsWith("{");
    }
    if (previousCharacter === ".") {
        const explicitInterface = /^(.+?)\s+(?:[A-Za-z_]\w*(?:\s*<[^(){};=]+>)?\.)+$/.exec(prefix);
        if (!explicitInterface) {
            return false;
        }
        prefix = explicitInterface[1];
    }
    if (!prefix) {
        return /^(?:\{|=>|:)/.test(suffix);
    }

    return isLikelyReturnType(prefix);
}

function isLikelyReturnType(value: string): boolean {
    if (/^(?:return|throw|yield|await|case|class|delegate|interface|operator|record|struct)\b/.test(value)) {
        return false;
    }

    return /^(?:(?:ref|readonly|scoped)\s+)*(?:global::)?[A-Za-z_]\w*(?:(?:::|\.)[A-Za-z_]\w*)*(?:\s*<[^(){};=]+>)?(?:\s*[?*]|\s*\[\s*,*\s*\])*$/.test(
        value,
    );
}

function isCastParenthesis(source: string, pair: ParenthesisPair): boolean {
    const value = source.slice(pair.openingIndex + 1, pair.closingIndex).trim();
    if (!value || !isLikelyCastType(value)) {
        return false;
    }

    const suffix = source.slice(pair.closingIndex + 1).trimStart();
    return !suffix.startsWith("=>") && /^(?:[A-Za-z_0-9]|new\b|this\b|base\b|[(["'!~])/.test(suffix);
}

function isParenthesizedExpression(source: string, mask: readonly boolean[], pair: ParenthesisPair): boolean {
    const value = source.slice(pair.openingIndex + 1, pair.closingIndex).trim();
    if (!value || findTopLevelCommas(source, mask, pair.openingIndex, pair.closingIndex).length > 0) {
        return false;
    }

    const suffix = source.slice(pair.closingIndex + 1).trimStart();
    const previousWord = previousCodeWord(source, pair.openingIndex);
    return !suffix.startsWith("=>") && (!previousWord || isExpressionPrefixKeyword(previousWord));
}

function isNonInvocationKeyword(value: string): boolean {
    return (
        csharpKeywords.has(value) ||
        [
            "ascending",
            "await",
            "by",
            "descending",
            "equals",
            "from",
            "group",
            "into",
            "join",
            "let",
            "nameof",
            "on",
            "orderby",
            "select",
            "when",
            "where",
            "yield",
        ].includes(value)
    );
}

function isExpressionPrefixKeyword(value: string): boolean {
    return [
        "await",
        "by",
        "case",
        "equals",
        "group",
        "in",
        "let",
        "on",
        "return",
        "select",
        "throw",
        "when",
        "where",
        "yield",
    ].includes(value);
}

function isObjectCreation(source: string, nameStart: number): boolean {
    const boundary = Math.max(
        source.lastIndexOf(";", nameStart - 1),
        source.lastIndexOf("{", nameStart - 1),
        source.lastIndexOf("}", nameStart - 1),
        source.lastIndexOf("=", nameStart - 1),
        source.lastIndexOf(",", nameStart - 1),
    );
    return /\bnew\s+(?:global::)?(?:[A-Za-z_]\w*(?:::|\.)?)*$/.test(source.slice(boundary + 1, nameStart));
}

function isConstructorInitializer(source: string, nameStart: number, name: string): boolean {
    return (name === "base" || name === "this") && /:\s*$/.test(source.slice(0, nameStart));
}

function isDelegateDeclaration(source: string, nameStart: number): boolean {
    const boundary = Math.max(
        source.lastIndexOf(";", nameStart - 1),
        source.lastIndexOf("{", nameStart - 1),
        source.lastIndexOf("}", nameStart - 1),
    );
    return /\bdelegate\b/.test(source.slice(boundary + 1, nameStart));
}

function previousCodeWord(source: string, index: number): string | undefined {
    const prefix = source.slice(0, findHorizontalWhitespaceStart(source, index));
    return /([A-Za-z_]\w*)$/.exec(prefix)?.[1];
}

function addInnerParenthesisSpacingReplacements(
    source: string,
    pair: ParenthesisPair,
    useSpaces: boolean,
    replacements: Array<{ start: number; end: number; value: string }>,
): void {
    const inner = source.slice(pair.openingIndex + 1, pair.closingIndex);
    if (inner.trim().length === 0) {
        if (!hasLineBreak(inner)) {
            replacements.push({
                start: pair.openingIndex + 1,
                end: pair.closingIndex,
                value: useSpaces ? " " : "",
            });
        }
        return;
    }

    const afterOpening = findHorizontalWhitespaceEnd(source, pair.openingIndex + 1);
    if (!/\r|\n/.test(source[afterOpening] ?? "")) {
        replacements.push({
            start: pair.openingIndex + 1,
            end: afterOpening,
            value: useSpaces ? " " : "",
        });
    }

    const beforeClosing = findHorizontalWhitespaceStart(source, pair.closingIndex);
    if (!/\r|\n/.test(source[beforeClosing - 1] ?? "")) {
        replacements.push({
            start: beforeClosing,
            end: pair.closingIndex,
            value: useSpaces ? " " : "",
        });
    }
}

function formatKeywordNewLines(source: string, keyword: string, useNewLine: boolean, lineEnding: string): string {
    if (useNewLine) {
        const pattern = new RegExp(`}[ \\t]*${keyword}\\b`, "g");
        return replaceCodeMatches(source, pattern, () => `}${lineEnding}${keyword}`);
    }

    const pattern = new RegExp(`}[ \\t]*(?:\\r\\n|\\n|\\r)[ \\t]*${keyword}\\b`, "g");
    return replaceCodeMatches(source, pattern, () => `} ${keyword}`);
}

function formatInitializerMemberNewLines(
    source: string,
    options: CSharpNewLineOptions,
    lineEnding: string,
): string {
    const mask = createCodeMask(source);
    const braceStack: number[] = [];
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (let index = 0; index < source.length; index++) {
        if (!mask[index]) {
            continue;
        }
        if (source[index] === "{") {
            braceStack.push(index);
            continue;
        }
        if (source[index] !== "}" || braceStack.length === 0) {
            continue;
        }

        const openingIndex = braceStack.pop()!;
        const initializerKind = classifyInitializer(source, mask, openingIndex, index);
        if (!initializerKind) {
            continue;
        }

        const useNewLine =
            initializerKind === "anonymous"
                ? options.beforeMembersInAnonymousTypes
                : options.beforeMembersInObjectInitializers;
        for (const commaIndex of findTopLevelCommas(source, mask, openingIndex, index)) {
            const whitespaceEnd = findWhitespaceEnd(source, commaIndex + 1);
            if (source.startsWith("//", whitespaceEnd) || source.startsWith("/*", whitespaceEnd)) {
                continue;
            }

            const whitespace = source.slice(commaIndex + 1, whitespaceEnd);
            const hasNewLine = /\r\n|\n|\r/.test(whitespace);
            if (useNewLine && !hasNewLine) {
                replacements.push({ start: commaIndex + 1, end: whitespaceEnd, value: lineEnding });
            } else if (!useNewLine && hasNewLine) {
                replacements.push({ start: commaIndex + 1, end: whitespaceEnd, value: " " });
            }
        }
    }

    return applyReplacements(source, replacements);
}

function classifyInitializer(
    source: string,
    mask: readonly boolean[],
    openingIndex: number,
    closingIndex: number,
): "anonymous" | "object" | undefined {
    const previousCode = source.slice(Math.max(0, openingIndex - 300), openingIndex).trimEnd();
    if (/\bnew\s*$/s.test(previousCode)) {
        return "anonymous";
    }
    if (!/\bnew\s*(?:[A-Za-z_][\w.<>,?\[\]]*\s*)?(?:\([^)]*\))?\s*$/s.test(previousCode)) {
        return undefined;
    }

    return hasTopLevelAssignment(source, mask, openingIndex, closingIndex) ? "object" : undefined;
}

function hasTopLevelAssignment(
    source: string,
    mask: readonly boolean[],
    openingIndex: number,
    closingIndex: number,
): boolean {
    let braceDepth = 0;
    let parenthesisDepth = 0;
    let bracketDepth = 0;

    for (let index = openingIndex + 1; index < closingIndex; index++) {
        if (!mask[index]) {
            continue;
        }

        const character = source[index];
        if (character === "{") {
            braceDepth++;
        } else if (character === "}") {
            braceDepth--;
        } else if (character === "(") {
            parenthesisDepth++;
        } else if (character === ")") {
            parenthesisDepth--;
        } else if (character === "[") {
            bracketDepth++;
        } else if (character === "]") {
            bracketDepth--;
        } else if (
            character === "=" &&
            braceDepth === 0 &&
            parenthesisDepth === 0 &&
            bracketDepth === 0 &&
            source[index - 1] !== "=" &&
            source[index + 1] !== "=" &&
            source[index + 1] !== ">"
        ) {
            return true;
        }
    }

    return false;
}

function findTopLevelCommas(
    source: string,
    mask: readonly boolean[],
    openingIndex: number,
    closingIndex: number,
): number[] {
    const commaIndexes: number[] = [];
    let braceDepth = 0;
    let parenthesisDepth = 0;
    let bracketDepth = 0;

    for (let index = openingIndex + 1; index < closingIndex; index++) {
        if (!mask[index]) {
            continue;
        }

        const character = source[index];
        if (character === "{") {
            braceDepth++;
        } else if (character === "}") {
            braceDepth--;
        } else if (character === "(") {
            parenthesisDepth++;
        } else if (character === ")") {
            parenthesisDepth--;
        } else if (character === "[") {
            bracketDepth++;
        } else if (character === "]") {
            bracketDepth--;
        } else if (character === "," && braceDepth === 0 && parenthesisDepth === 0 && bracketDepth === 0) {
            commaIndexes.push(index);
        }
    }

    return commaIndexes;
}

function formatQueryExpressionClauseNewLines(source: string, useNewLine: boolean, lineEnding: string): string {
    const mask = createCodeMask(source);
    const depth = createCodeDepth(source, mask);
    const clausePattern = /\b(?:from|let|where|join|orderby|select|group|into)\b/g;
    const clauseMatches = [...source.matchAll(clausePattern)].filter(match => mask[match.index]);
    const replacements: Array<{ start: number; end: number; value: string }> = [];
    const queryRanges: Array<{ start: number; end: number; depth: CodeDepth }> = [];

    for (const match of clauseMatches) {
        const startIndex = match.index;
        if (match[0] !== "from" || !looksLikeFromClause(source, startIndex)) {
            continue;
        }

        const queryDepth = depth[startIndex];
        if (
            queryRanges.some(
                range =>
                    range.start < startIndex &&
                    startIndex < range.end &&
                    sameCodeDepth(range.depth, queryDepth),
            )
        ) {
            continue;
        }

        const queryEnd = findQueryExpressionEnd(source, mask, depth, startIndex, queryDepth);
        queryRanges.push({ start: startIndex, end: queryEnd, depth: queryDepth });

        for (const clause of clauseMatches) {
            if (clause.index <= startIndex || clause.index >= queryEnd || !sameCodeDepth(depth[clause.index], queryDepth)) {
                continue;
            }

            const whitespaceStart = findWhitespaceStart(source, clause.index);
            const whitespace = source.slice(whitespaceStart, clause.index);
            const hasNewLine = /\r\n|\n|\r/.test(whitespace);
            if (useNewLine && !hasNewLine) {
                replacements.push({ start: whitespaceStart, end: clause.index, value: lineEnding });
            } else if (!useNewLine && hasNewLine && canJoinQueryClauseLine(source, whitespaceStart)) {
                replacements.push({ start: whitespaceStart, end: clause.index, value: " " });
            }
        }
    }

    return applyReplacements(source, replacements);
}

function canJoinQueryClauseLine(source: string, whitespaceStart: number): boolean {
    const previousLineStart =
        Math.max(source.lastIndexOf("\n", whitespaceStart - 1), source.lastIndexOf("\r", whitespaceStart - 1)) + 1;
    return !source.slice(previousLineStart, whitespaceStart).includes("//");
}

interface CodeDepth {
    readonly braces: number;
    readonly parentheses: number;
    readonly brackets: number;
}

function createCodeDepth(source: string, mask: readonly boolean[]): CodeDepth[] {
    const result: CodeDepth[] = [];
    let braces = 0;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index < source.length; index++) {
        result.push({ braces, parentheses, brackets });
        if (!mask[index]) {
            continue;
        }

        const character = source[index];
        if (character === "{") {
            braces++;
        } else if (character === "}") {
            braces--;
        } else if (character === "(") {
            parentheses++;
        } else if (character === ")") {
            parentheses--;
        } else if (character === "[") {
            brackets++;
        } else if (character === "]") {
            brackets--;
        }
    }

    return result;
}

function looksLikeFromClause(source: string, startIndex: number): boolean {
    return /^from\s+(?:(?:global::)?[A-Za-z_][\w.<>,?\[\]]*\s+)?[A-Za-z_]\w*\s+in\b/s.test(
        source.slice(startIndex, startIndex + 200),
    );
}

function findQueryExpressionEnd(
    source: string,
    mask: readonly boolean[],
    depth: readonly CodeDepth[],
    startIndex: number,
    queryDepth: CodeDepth,
): number {
    for (let index = startIndex + 4; index < source.length; index++) {
        if (!mask[index]) {
            continue;
        }

        if (source[index] === ";" && sameCodeDepth(depth[index], queryDepth)) {
            return index;
        }
        if (
            (source[index] === ")" && depth[index].parentheses === queryDepth.parentheses) ||
            (source[index] === "]" && depth[index].brackets === queryDepth.brackets) ||
            (source[index] === "}" && depth[index].braces === queryDepth.braces)
        ) {
            return index;
        }
    }

    return source.length;
}

function sameCodeDepth(left: CodeDepth, right: CodeDepth): boolean {
    return (
        left.braces === right.braces &&
        left.parentheses === right.parentheses &&
        left.brackets === right.brackets
    );
}

function formatOpenBraceNewLines(
    source: string,
    configuredContexts: CSharpNewLineOptions["beforeOpenBrace"],
    lineEnding: string,
): string {
    const mask = createCodeMask(source);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (let index = 0; index < source.length; index++) {
        if (source[index] !== "{" || !mask[index]) {
            continue;
        }

        const context = classifyOpenBrace(source, index);
        const requireNewLine = shouldUseNewLine(configuredContexts, context);
        const whitespaceStart = findWhitespaceStart(source, index);
        const whitespace = source.slice(whitespaceStart, index);
        const hasNewLine = /\r\n|\n|\r/.test(whitespace);

        if (requireNewLine && !hasNewLine) {
            replacements.push({ start: whitespaceStart, end: index, value: lineEnding });
        } else if (!requireNewLine && hasNewLine && canJoinBraceLine(source, whitespaceStart)) {
            replacements.push({ start: whitespaceStart, end: index, value: " " });
        } else if (!requireNewLine && !hasNewLine && whitespace !== " ") {
            replacements.push({ start: whitespaceStart, end: index, value: " " });
        }
    }

    return applyReplacements(source, replacements);
}

function classifyOpenBrace(source: string, braceIndex: number): ReadonlySet<CSharpOpenBraceContext> {
    const lineStart = Math.max(source.lastIndexOf("\n", braceIndex - 1), source.lastIndexOf("\r", braceIndex - 1)) + 1;
    const currentLinePrefix = source.slice(lineStart, braceIndex).trim();
    const previousCode = source.slice(Math.max(0, lineStart - 300), braceIndex).trimEnd();
    const contexts = new Set<CSharpOpenBraceContext>();

    if (/\b(class|struct|interface|record|enum)\b[^{};]*$/s.test(previousCode)) {
        contexts.add("types");
    }
    if (
        /\b(if|else|for|foreach|while|switch|try|catch|finally|do|lock|using|fixed|checked|unchecked)\b[^{};]*$/s.test(
            previousCode,
        )
    ) {
        contexts.add("control_blocks");
    }
    if (/\b(get|set|init|add|remove)\s*$/s.test(previousCode)) {
        contexts.add("accessors");
    }
    if (/\bevent\b[^=;{}]*$/s.test(previousCode)) {
        contexts.add("events");
    }
    if (/\bdelegate\b[^;{}]*$/s.test(previousCode)) {
        contexts.add("anonymous_methods");
    }
    if (/=>\s*$/s.test(previousCode)) {
        contexts.add("lambdas");
    }
    if (/\]\s*$/s.test(previousCode)) {
        contexts.add("indexers");
    }
    if (/\bnew\s*$/s.test(previousCode)) {
        contexts.add("anonymous_types");
    } else if (/\bnew\s*(?:[A-Za-z_][\w.<>,?\[\]]*\s*)?(?:\([^)]*\)|\[\])\s*$/s.test(previousCode)) {
        contexts.add("object_collection_array_initializers");
    }
    if (/\)\s*$/s.test(previousCode) && contexts.size === 0) {
        contexts.add(getBraceDepthBefore(source, braceIndex) >= 2 ? "local_functions" : "methods");
    }
    if (contexts.size === 0 && /(?:[A-Za-z_][\w<>?,.\[\]]*\s+)+[A-Za-z_][\w]*\s*$/s.test(previousCode)) {
        contexts.add("properties");
    }
    if (contexts.size === 0 && currentLinePrefix.length === 0) {
        contexts.add("control_blocks");
    }

    return contexts;
}

function shouldUseNewLine(
    configuredContexts: CSharpNewLineOptions["beforeOpenBrace"],
    contexts: ReadonlySet<CSharpOpenBraceContext>,
): boolean {
    if (configuredContexts === "all") {
        return true;
    }
    if (configuredContexts === "none") {
        return false;
    }

    return [...contexts].some(context => configuredContexts.has(context));
}

function splitSingleLineStatements(source: string, lineEnding: string): string {
    const mask = createCodeMask(source);
    const forRanges = findForParenthesisRanges(source, mask);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (let index = 0; index < source.length; index++) {
        if (source[index] !== ";" || !mask[index] || isInsideRanges(index, forRanges)) {
            continue;
        }

        const lineEnd = findLineEnd(source, index);
        const remaining = source.slice(index + 1, lineEnd);
        if (remaining.trim().length === 0 || remaining.trimStart().startsWith("//")) {
            continue;
        }

        const whitespaceEnd = index + 1 + (/^[ \t]*/.exec(remaining)?.[0].length ?? 0);
        replacements.push({ start: index + 1, end: whitespaceEnd, value: lineEnding });
    }

    return applyReplacements(source, replacements);
}

function expandSingleLineBlocks(source: string, lineEnding: string): string {
    const mask = createCodeMask(source);
    const braceStack: number[] = [];
    const blockOpenings = new Set<number>();
    const blockClosings = new Set<number>();

    for (let index = 0; index < source.length; index++) {
        if (!mask[index]) {
            continue;
        }
        if (source[index] === "{") {
            braceStack.push(index);
            continue;
        }
        if (source[index] !== "}" || braceStack.length === 0) {
            continue;
        }

        const openingIndex = braceStack.pop()!;
        if (hasLineBreak(source.slice(openingIndex, index)) || isInitializerBrace(source, openingIndex)) {
            continue;
        }

        blockOpenings.add(openingIndex);
        blockClosings.add(index);
    }

    let result = "";
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (blockOpenings.has(index)) {
            result = result.trimEnd() + `{${lineEnding}`;
            while (index + 1 < source.length && /[ \t]/.test(source[index + 1])) {
                index++;
            }
        } else if (blockClosings.has(index)) {
            result = result.trimEnd() + `${lineEnding}}`;
            const remainderEnd = findLineEnd(source, index);
            const remainder = source.slice(index + 1, remainderEnd);
            const nextCode = remainder.trimStart();
            if (nextCode.length > 0 && !/^(?:else|catch|finally)\b/.test(nextCode) && !nextCode.startsWith(";")) {
                result += lineEnding;
                while (index + 1 < remainderEnd && /[ \t]/.test(source[index + 1])) {
                    index++;
                }
            }
        } else {
            result += character;
        }
    }

    return result;
}

function formatForSemicolons(source: string, options: CSharpSpacingOptions): string {
    const mask = createCodeMask(source);
    const ranges = findForParenthesisRanges(source, mask);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (const range of ranges) {
        for (let index = range.start + 1; index < range.end; index++) {
            if (source[index] !== ";" || !mask[index]) {
                continue;
            }

            const before = findHorizontalWhitespaceStart(source, index);
            const after = findHorizontalWhitespaceEnd(source, index + 1);
            replacements.push({
                start: before,
                end: after,
                value: `${options.beforeForSemicolon ? " " : ""};${options.afterForSemicolon ? " " : ""}`,
            });
        }
    }

    return applyReplacements(source, replacements);
}

function formatCastSpacing(source: string, useSpace: boolean): string {
    const mask = createCodeMask(source);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (const pair of findParenthesisPairs(source, mask)) {
        if (!isCastParenthesis(source, pair)) {
            continue;
        }

        const whitespaceEnd = findHorizontalWhitespaceEnd(source, pair.closingIndex + 1);
        replacements.push({
            start: pair.closingIndex + 1,
            end: whitespaceEnd,
            value: /\r|\n/.test(source[whitespaceEnd] ?? "") ? "" : useSpace ? " " : "",
        });
    }

    return applyReplacements(source, replacements);
}

function isLikelyCastType(value: string): boolean {
    const normalized = value.replace(/^global::/, "");
    const simpleName =
        normalized
            .split(/[.<]/)
            .at(-1)
            ?.replace(/[?*]|\[\]/g, "") ?? "";
    const builtInTypes = new Set([
        "bool",
        "byte",
        "char",
        "decimal",
        "double",
        "float",
        "int",
        "long",
        "object",
        "sbyte",
        "short",
        "string",
        "uint",
        "ulong",
        "ushort",
    ]);

    return builtInTypes.has(simpleName) || /^[A-Z]/.test(simpleName) || /[.<>?*\[\]]/.test(normalized);
}

function formatInheritanceColonSpacing(source: string, options: CSharpSpacingOptions): string {
    const lines = splitLinesWithEndings(source);
    return lines
        .map(line => {
            if (
                !/^\s*(?:public|private|protected|internal|abstract|sealed|static|partial|readonly|ref|file|unsafe|new|\s)*(?:class|struct|interface|record)\b/.test(
                    line.content,
                )
            ) {
                return line.content + line.ending;
            }

            const mask = createCodeMask(line.content);
            for (let index = 0; index < line.content.length; index++) {
                if (
                    line.content[index] !== ":" ||
                    !mask[index] ||
                    line.content[index - 1] === ":" ||
                    line.content[index + 1] === ":"
                ) {
                    continue;
                }

                const before = findHorizontalWhitespaceStart(line.content, index);
                const after = findHorizontalWhitespaceEnd(line.content, index + 1);
                const colon = `${options.beforeInheritanceColon ? " " : ""}:${options.afterInheritanceColon ? " " : ""}`;
                return line.content.slice(0, before) + colon + line.content.slice(after) + line.ending;
            }

            return line.content + line.ending;
        })
        .join("");
}

function formatBinaryOperatorSpacing(source: string, useSpaces: boolean): string {
    const mask = createCodeMask(source);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (const match of source.matchAll(binaryOperatorPattern)) {
        const operator = match[0];
        const index = match.index;
        if (!mask[index] || isUnaryOrNonBinaryOperator(source, index, operator)) {
            continue;
        }

        const before = findHorizontalWhitespaceStart(source, index);
        const after = findHorizontalWhitespaceEnd(source, index + operator.length);
        replacements.push({
            start: before,
            end: after,
            value: `${useSpaces ? " " : ""}${operator}${useSpaces ? " " : ""}`,
        });
    }

    return applyReplacements(source, replacements);
}

function isUnaryOrNonBinaryOperator(source: string, index: number, operator: string): boolean {
    const previous = previousNonWhitespace(source, index - 1);
    const next = nextNonWhitespace(source, index + operator.length);
    if (!previous || !next) {
        return true;
    }
    if ((operator === "+" || operator === "-") && (previous === operator || next === operator)) {
        return true;
    }
    const isGenericAngleOperator = operator === "<" || /^>+$/.test(operator);
    const canFollowGeneric = /^>+$/.test(operator) && /[({[\]),;:?.]/.test(next);
    if (isGenericAngleOperator && /[A-Za-z0-9_]/.test(previous) && (/[A-Za-z_]/.test(next) || canFollowGeneric)) {
        return looksLikeGenericAngleBracket(source, index, operator);
    }

    return /[({[,:;=?!~+\-*/%&|^<>]/.test(previous);
}

function looksLikeGenericAngleBracket(source: string, index: number, operator: string): boolean {
    if (/\s/.test(source[index - 1] ?? "")) {
        return false;
    }

    if (operator.startsWith("<")) {
        const typeName = /([A-Za-z_][\w]*)$/.exec(source.slice(0, index))?.[1];
        const closingIndex = source.indexOf(">", index + 1);
        return Boolean(
            typeName && /^[A-Z]/.test(typeName) && closingIndex > index && !hasLineBreak(source.slice(index, closingIndex)),
        );
    }

    const openingIndex = source.lastIndexOf("<", index - 1);
    const typeName = openingIndex >= 0 ? /([A-Za-z_][\w]*)$/.exec(source.slice(0, openingIndex))?.[1] : undefined;
    return Boolean(typeName && /^[A-Z]/.test(typeName) && !hasLineBreak(source.slice(openingIndex, index)));
}

function getBraceDepthBefore(source: string, end: number): number {
    const mask = createCodeMask(source.slice(0, end));
    let depth = 0;
    for (let index = 0; index < end; index++) {
        if (!mask[index]) {
            continue;
        }
        if (source[index] === "{") {
            depth++;
        } else if (source[index] === "}") {
            depth = Math.max(0, depth - 1);
        }
    }
    return depth;
}

function findForParenthesisRanges(source: string, mask: readonly boolean[]): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const pattern = /\bfor\s*\(/g;

    for (const match of source.matchAll(pattern)) {
        const openingIndex = match.index + match[0].lastIndexOf("(");
        if (!mask[match.index] || !mask[openingIndex]) {
            continue;
        }

        const closingIndex = findMatchingCharacter(source, mask, openingIndex, "(", ")");
        if (closingIndex >= 0) {
            ranges.push({ start: openingIndex, end: closingIndex });
        }
    }

    return ranges;
}

function findMatchingCharacter(
    source: string,
    mask: readonly boolean[],
    start: number,
    opening: string,
    closing: string,
): number {
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        if (!mask[index]) {
            continue;
        }
        if (source[index] === opening) {
            depth++;
        } else if (source[index] === closing && --depth === 0) {
            return index;
        }
    }
    return -1;
}

function createCodeMask(source: string): boolean[] {
    const mask = Array<boolean>(source.length).fill(true);
    const state: LexicalState = { mode: "normal", rawQuoteCount: 0 };

    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        const next = source[index + 1];

        if (state.mode === "normal") {
            if (character === "/" && next === "/") {
                const end = findLineEnd(source, index);
                markProtected(mask, index, end);
                index = end - 1;
            } else if (character === "/" && next === "*") {
                state.mode = "blockComment";
                mask[index] = false;
            } else if (character === "@" && next === '"') {
                state.mode = "verbatimString";
                mask[index] = false;
                mask[index + 1] = false;
                index++;
            } else if (character === '"' && countRun(source, index, '"') >= 3) {
                state.mode = "rawString";
                state.rawQuoteCount = countRun(source, index, '"');
                markProtected(mask, index, index + state.rawQuoteCount);
                index += state.rawQuoteCount - 1;
            } else if (character === '"') {
                state.mode = "regularString";
                mask[index] = false;
            } else if (character === "'") {
                state.mode = "char";
                mask[index] = false;
            }
            continue;
        }

        mask[index] = false;
        if (state.mode === "blockComment" && character === "*" && next === "/") {
            mask[index + 1] = false;
            state.mode = "normal";
            index++;
        } else if (state.mode === "verbatimString" && character === '"') {
            if (next === '"') {
                mask[index + 1] = false;
                index++;
            } else {
                state.mode = "normal";
            }
        } else if (state.mode === "rawString" && character === '"' && countRun(source, index, '"') >= state.rawQuoteCount) {
            markProtected(mask, index, index + state.rawQuoteCount);
            index += state.rawQuoteCount - 1;
            state.mode = "normal";
        } else if ((state.mode === "regularString" || state.mode === "char") && character === "\\") {
            mask[index + 1] = false;
            index++;
        } else if ((state.mode === "regularString" && character === '"') || (state.mode === "char" && character === "'")) {
            state.mode = "normal";
        }
    }

    return mask;
}

function replaceCodeMatches(source: string, pattern: RegExp, replacer: (match: string) => string): string {
    const mask = createCodeMask(source);
    const replacements: Array<{ start: number; end: number; value: string }> = [];

    for (const match of source.matchAll(pattern)) {
        if (isMatchInCode(match[0], match.index, mask)) {
            replacements.push({ start: match.index, end: match.index + match[0].length, value: replacer(match[0]) });
        }
    }

    return applyReplacements(source, replacements);
}

function isMatchInCode(match: string, start: number, mask: readonly boolean[]): boolean {
    for (let offset = 0; offset < match.length; offset++) {
        if (!/\s/.test(match[offset]) && !mask[start + offset]) {
            return false;
        }
    }
    return true;
}

function applyReplacements(source: string, replacements: readonly { start: number; end: number; value: string }[]): string {
    return [...replacements]
        .sort((left, right) => right.start - left.start)
        .reduce((result, replacement) => {
            return result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
        }, source);
}

function splitLinesWithEndings(source: string): Array<{ content: string; ending: string }> {
    const result: Array<{ content: string; ending: string }> = [];
    const pattern = /.*?(\r\n|\n|\r|$)/gs;
    for (const match of source.matchAll(pattern)) {
        if (!match[0]) {
            continue;
        }
        const ending = match[1] ?? "";
        result.push({ content: match[0].slice(0, match[0].length - ending.length), ending });
    }
    return result;
}

function isInitializerBrace(source: string, index: number): boolean {
    const lineStart = Math.max(source.lastIndexOf("\n", index - 1), source.lastIndexOf("\r", index - 1)) + 1;
    const prefix = source.slice(lineStart, index).trimEnd();
    return /=\s*(?:new\b[^;{}]*)?$/.test(prefix) || /\bnew\b[^;{}]*$/.test(prefix);
}

function canJoinBraceLine(source: string, whitespaceStart: number): boolean {
    const previousLineStart =
        Math.max(source.lastIndexOf("\n", whitespaceStart - 1), source.lastIndexOf("\r", whitespaceStart - 1)) + 1;
    const previousLine = source.slice(previousLineStart, whitespaceStart).trim();
    return previousLine.length > 0 && !previousLine.startsWith("#") && !previousLine.endsWith("//");
}

function findWhitespaceStart(source: string, index: number): number {
    let cursor = index;
    while (cursor > 0 && /\s/.test(source[cursor - 1])) {
        cursor--;
    }
    return cursor;
}

function findWhitespaceEnd(source: string, index: number): number {
    let cursor = index;
    while (cursor < source.length && /\s/.test(source[cursor])) {
        cursor++;
    }
    return cursor;
}

function findHorizontalWhitespaceStart(source: string, index: number): number {
    let cursor = index;
    while (cursor > 0 && /[ \t]/.test(source[cursor - 1])) {
        cursor--;
    }
    return cursor;
}

function findHorizontalWhitespaceEnd(source: string, index: number): number {
    let cursor = index;
    while (cursor < source.length && /[ \t]/.test(source[cursor])) {
        cursor++;
    }
    return cursor;
}

function findLineEnd(source: string, index: number): number {
    const lineFeed = source.indexOf("\n", index);
    const carriageReturn = source.indexOf("\r", index);
    if (lineFeed < 0) {
        return carriageReturn < 0 ? source.length : carriageReturn;
    }
    return carriageReturn < 0 ? lineFeed : Math.min(lineFeed, carriageReturn);
}

function previousNonWhitespace(source: string, index: number): string | undefined {
    while (index >= 0 && /\s/.test(source[index])) {
        index--;
    }
    return source[index];
}

function nextNonWhitespace(source: string, index: number): string | undefined {
    while (index < source.length && /\s/.test(source[index])) {
        index++;
    }
    return source[index];
}

function isInsideRanges(index: number, ranges: readonly { start: number; end: number }[]): boolean {
    return ranges.some(range => index > range.start && index < range.end);
}

function detectLineEnding(source: string): string {
    return /\r\n/.test(source) ? "\r\n" : /\r/.test(source) ? "\r" : "\n";
}

function hasLineBreak(source: string): boolean {
    return /\r\n|\n|\r/.test(source);
}

function markProtected(mask: boolean[], start: number, end: number): void {
    for (let index = start; index < Math.min(end, mask.length); index++) {
        mask[index] = false;
    }
}

function countRun(source: string, start: number, character: string): number {
    let count = 0;
    while (source[start + count] === character) {
        count++;
    }
    return count;
}
