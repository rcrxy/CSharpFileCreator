import type { CSharpIndentationOptions, IndentationOptions } from "../../../core/editorConfig";

export interface CSharpFormattingOptions {
    readonly indentation: IndentationOptions;
    readonly csharpIndentation: CSharpIndentationOptions;
}

interface SwitchScope {
    readonly bodyDepth: number;
    hasActiveCase: boolean;
    caseBlockBodyDepth?: number;
}

interface LexicalState {
    mode: "normal" | "blockComment" | "regularString" | "verbatimString" | "char" | "rawString";
    rawQuoteCount: number;
}

interface LineSyntax {
    readonly leadingCloseBraces: number;
    readonly openBraces: number;
    readonly closeBraces: number;
    readonly leadingCloseDelimiters: number;
    readonly openDelimiters: number;
    readonly closeDelimiters: number;
    readonly containsSwitch: boolean;
}

const caseLabelPattern = /^(?:case\b.*|default)\s*:/;
const labelPattern = /^[A-Za-z_][\w]*\s*:/;
const embeddedStatementHeaderPattern = /^(?:(?:if|for|foreach|while|using|lock|fixed)\s*\(.*\)|else(?:\s+if\s*\(.*\))?|do)\s*$/;

/**
 * 仅重写 C# 行首缩进；调用方可通过行号限制实际替换范围。
 */
export function formatCSharpIndentation(source: string, options: CSharpFormattingOptions): string {
    const separators = source.match(/\r\n|\n|\r/g) ?? [];
    const lines = source.split(/\r\n|\n|\r/);
    const indentUnit = options.indentation.style === "tab" ? "\t" : " ".repeat(options.indentation.size);
    const formattedLines: string[] = [];
    const switches: SwitchScope[] = [];
    const lexicalState: LexicalState = { mode: "normal", rawQuoteCount: 0 };
    let braceDepth = 0;
    let delimiterDepth = 0;
    let embeddedStatementDepth = 0;
    let pendingSwitch = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) {
            formattedLines.push("");
            continue;
        }

        const syntax = scanLineSyntax(line, lexicalState);
        const effectiveDepth = Math.max(0, braceDepth - syntax.leadingCloseBraces);
        const effectiveDelimiterDepth = Math.max(0, delimiterDepth - syntax.leadingCloseDelimiters);
        removeClosedSwitchScopes(switches, effectiveDepth);
        const activeSwitch = switches.at(-1);
        const isCaseLabel = caseLabelPattern.test(trimmedLine);
        const isOrdinaryLabel = effectiveDelimiterDepth === 0 && !isCaseLabel && labelPattern.test(trimmedLine);
        const isBraceLine = /^[{}]/.test(trimmedLine);
        const isCaseBlockBrace = Boolean(
            activeSwitch?.hasActiveCase && trimmedLine.startsWith("{") && effectiveDepth === activeSwitch.bodyDepth,
        );
        const isCaseBlockClosingBrace = Boolean(
            activeSwitch?.caseBlockBodyDepth !== undefined &&
            trimmedLine.startsWith("}") &&
            effectiveDepth === activeSwitch.caseBlockBodyDepth - 1,
        );

        let indentDepth =
            resolveGeneralIndentDepth(effectiveDepth, options.csharpIndentation) +
            Number(options.csharpIndentation.indentBlockContents) * embeddedStatementDepth;

        if (isCaseLabel && activeSwitch) {
            indentDepth = resolveSwitchLabelDepth(activeSwitch, options.csharpIndentation);
        } else if ((isCaseBlockBrace || isCaseBlockClosingBrace) && activeSwitch) {
            indentDepth =
                resolveSwitchLabelDepth(activeSwitch, options.csharpIndentation) +
                Number(options.csharpIndentation.indentCaseContentsWhenBlock);
        } else if (activeSwitch?.hasActiveCase && effectiveDepth >= activeSwitch.bodyDepth) {
            indentDepth = resolveCaseContentDepth(activeSwitch, effectiveDepth, options.csharpIndentation);
        }

        if (isOrdinaryLabel) {
            indentDepth = resolveOrdinaryLabelDepth(indentDepth, options.csharpIndentation.indentLabels);
        }

        if (isBraceLine && !isCaseBlockBrace && !isCaseBlockClosingBrace) {
            indentDepth =
                resolveGeneralIndentDepth(effectiveDepth, options.csharpIndentation) +
                Number(options.csharpIndentation.indentBraces);
        }

        indentDepth += effectiveDelimiterDepth;
        formattedLines.push(indentUnit.repeat(Math.max(0, indentDepth)) + trimmedLine);

        if (isCaseLabel && activeSwitch) {
            activeSwitch.hasActiveCase = true;
            activeSwitch.caseBlockBodyDepth = undefined;
        }

        if (isCaseBlockBrace && activeSwitch && syntax.openBraces > syntax.closeBraces) {
            activeSwitch.caseBlockBodyDepth = effectiveDepth + 1;
        }

        if (isCaseBlockClosingBrace && activeSwitch) {
            activeSwitch.caseBlockBodyDepth = undefined;
        }

        const depthBeforeUpdate = braceDepth;
        braceDepth = Math.max(0, braceDepth + syntax.openBraces - syntax.closeBraces);
        delimiterDepth = Math.max(0, delimiterDepth + syntax.openDelimiters - syntax.closeDelimiters);

        if (pendingSwitch && syntax.openBraces > 0) {
            switches.push({ bodyDepth: depthBeforeUpdate + 1, hasActiveCase: false });
            pendingSwitch = false;
        }

        if (syntax.containsSwitch) {
            if (syntax.openBraces > 0) {
                switches.push({ bodyDepth: depthBeforeUpdate + 1, hasActiveCase: false });
            } else {
                pendingSwitch = true;
            }
        }

        if (startsEmbeddedStatementBody(trimmedLine, lines, lineIndex)) {
            embeddedStatementDepth++;
        } else if (embeddedStatementDepth > 0 && completesEmbeddedStatement(trimmedLine)) {
            embeddedStatementDepth = 0;
        }
    }

    return formattedLines.reduce((result, line, index) => result + line + (separators[index] ?? ""), "");
}

function startsEmbeddedStatementBody(trimmedLine: string, lines: readonly string[], lineIndex: number): boolean {
    if (!embeddedStatementHeaderPattern.test(trimmedLine)) {
        return false;
    }

    return findNextNonEmptyLine(lines, lineIndex + 1) !== "{";
}

function completesEmbeddedStatement(trimmedLine: string): boolean {
    return trimmedLine.endsWith(";") && !trimmedLine.startsWith("//");
}

function findNextNonEmptyLine(lines: readonly string[], startIndex: number): string | undefined {
    for (let index = startIndex; index < lines.length; index++) {
        const trimmedLine = lines[index].trim();
        if (trimmedLine.length > 0 && !trimmedLine.startsWith("//")) {
            return trimmedLine;
        }
    }

    return undefined;
}

function resolveGeneralIndentDepth(depth: number, options: CSharpIndentationOptions): number {
    return options.indentBlockContents ? depth : 0;
}

function resolveSwitchLabelDepth(scope: SwitchScope, options: CSharpIndentationOptions): number {
    const switchParentDepth = Math.max(0, scope.bodyDepth - 1);
    return resolveGeneralIndentDepth(switchParentDepth, options) + Number(options.indentSwitchLabels);
}

function resolveCaseContentDepth(scope: SwitchScope, effectiveDepth: number, options: CSharpIndentationOptions): number {
    const labelDepth = resolveSwitchLabelDepth(scope, options);
    if (scope.caseBlockBodyDepth !== undefined && effectiveDepth >= scope.caseBlockBodyDepth) {
        const nestedDepth = effectiveDepth - scope.caseBlockBodyDepth;
        return (
            labelDepth + Number(options.indentCaseContentsWhenBlock) + Number(options.indentBlockContents) * (nestedDepth + 1)
        );
    }

    return labelDepth + Number(options.indentCaseContents);
}

function resolveOrdinaryLabelDepth(currentDepth: number, option: CSharpIndentationOptions["indentLabels"]): number {
    if (option === "flush_left") {
        return 0;
    }

    return option === "one_less_than_current" ? Math.max(0, currentDepth - 1) : currentDepth;
}

function removeClosedSwitchScopes(scopes: SwitchScope[], effectiveDepth: number): void {
    while (scopes.length > 0 && effectiveDepth < scopes.at(-1)!.bodyDepth) {
        scopes.pop();
    }
}

function scanLineSyntax(line: string, state: LexicalState): LineSyntax {
    let openBraces = 0;
    let closeBraces = 0;
    let leadingCloseBraces = 0;
    let openDelimiters = 0;
    let closeDelimiters = 0;
    let leadingCloseDelimiters = 0;
    let containsSwitch = false;
    let sawCodeToken = false;
    let identifier = "";

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

        if (/[$@A-Za-z_]/.test(character)) {
            identifier += character;
            sawCodeToken = true;
            continue;
        }

        if (identifier) {
            containsSwitch ||= identifier === "switch";
            identifier = "";
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
            openBraces++;
            sawCodeToken = true;
        } else if (character === "}") {
            closeBraces++;
            if (!sawCodeToken) {
                leadingCloseBraces++;
            }
        } else if (character === "(" || character === "[") {
            openDelimiters++;
            sawCodeToken = true;
        } else if (character === ")" || character === "]") {
            closeDelimiters++;
            if (!sawCodeToken) {
                leadingCloseDelimiters++;
            }
        } else if (!/\s/.test(character)) {
            sawCodeToken = true;
        }
    }

    containsSwitch ||= identifier === "switch";
    if (state.mode === "regularString" || state.mode === "char") {
        state.mode = "normal";
    }

    return {
        leadingCloseBraces,
        openBraces,
        closeBraces,
        leadingCloseDelimiters,
        openDelimiters,
        closeDelimiters,
        containsSwitch,
    };
}

function countRun(line: string, start: number, character: string): number {
    let count = 0;
    while (line[start + count] === character) {
        count++;
    }
    return count;
}
