import type { HtmlFormattingOptions } from "../../../core/editorConfig";

interface TagAttribute {
    readonly name: string;
    readonly value?: string;
}

interface ParsedTag {
    readonly name: string;
    readonly attributes: readonly TagAttribute[];
    readonly closing: boolean;
    readonly selfClosing: boolean;
    readonly original: string;
}

interface TagRange {
    readonly start: number;
    readonly end: number;
    readonly tag: ParsedTag;
}

/**
 * 按 JetBrains HTML EditorConfig 规则格式化 Razor 中的 HTML/组件标签。
 */
export function formatRazorTags(source: string, options: HtmlFormattingOptions, lineEnding: string): string {
    const protectedRanges = findProtectedElementRanges(source, options.preserveSpacesInsideTags);
    const protectedContent = protectRanges(source, protectedRanges);
    const tags = scanTags(protectedContent.source);
    let formatted = applyTagFormatting(protectedContent.source, tags, options, lineEnding);
    formatted = formatElementBoundaries(formatted, options, lineEnding);
    formatted = limitBlankLinesBetweenTags(formatted, options.maxBlankLinesBetweenTags, lineEnding);
    return restoreProtectedContent(formatted, protectedContent.values);
}

function applyTagFormatting(
    source: string,
    tags: readonly TagRange[],
    options: HtmlFormattingOptions,
    lineEnding: string,
): string {
    return [...tags]
        .sort((left, right) => right.start - left.start)
        .reduce((result, range) => {
            const formattedTag = formatTag(range.tag, getLineIndent(source, range.start), options, lineEnding);
            return result.slice(0, range.start) + formattedTag + result.slice(range.end);
        }, source);
}

function formatTag(tag: ParsedTag, baseIndent: string, options: HtmlFormattingOptions, lineEnding: string): string {
    if (tag.closing || tag.attributes.length === 0 || options.attributeStyle === "do_not_touch") {
        return formatTagDelimiters(tag.original, tag, options);
    }

    const attributes = tag.attributes.map(attribute => formatAttribute(attribute, options));
    const close = getTagClose(tag, options);
    const singleLine = `<${tag.name} ${attributes.join(" ")}${close}`;
    const shouldWrap = shouldWrapAttributes(singleLine, baseIndent, options);
    const shouldUseMultilineStyle =
        options.attributeStyle === "first_attribute_on_single_line" && attributes.length === 1
            ? false
            : options.attributeWrap === "off"
              ? options.attributeStyle !== "on_single_line"
              : shouldWrap;

    if (!shouldUseMultilineStyle) {
        return singleLine;
    }

    return formatMultilineTag(tag, baseIndent, attributes, close, options, lineEnding);
}

function shouldWrapAttributes(singleLine: string, baseIndent: string, options: HtmlFormattingOptions): boolean {
    if (options.attributeWrap !== "normal" || options.maxLineLength === undefined) {
        return false;
    }
    return visualLength(baseIndent + singleLine, options.indentation.tabWidth) > options.maxLineLength;
}

function formatMultilineTag(
    tag: ParsedTag,
    baseIndent: string,
    attributes: readonly string[],
    close: string,
    options: HtmlFormattingOptions,
    lineEnding: string,
): string {
    const attributeIndent = getAttributeIndent(baseIndent, tag.name, options);
    if (options.attributeStyle === "first_attribute_on_single_line" && attributes.length > 1) {
        return `<${tag.name} ${attributes[0]}${attributes
            .slice(1)
            .map((attribute, index, remainingAttributes) => {
                const suffix = index === remainingAttributes.length - 1 ? close : "";
                return `${lineEnding}${attributeIndent}${attribute}${suffix}`;
            })
            .join("")}`;
    }

    return `<${tag.name}${attributes
        .map((attribute, index) => {
            const suffix = index === attributes.length - 1 ? close : "";
            return `${lineEnding}${attributeIndent}${attribute}${suffix}`;
        })
        .join("")}`;
}

function visualLength(value: string, tabWidth: number): number {
    let column = 0;
    for (const character of value) {
        if (character === "\t") {
            column += tabWidth - (column % tabWidth);
        } else {
            column++;
        }
    }
    return column;
}

function formatTagDelimiters(original: string, tag: ParsedTag, options: HtmlFormattingOptions): string {
    if (tag.closing || original.startsWith("<!") || original.startsWith("<?")) {
        return original;
    }

    let result = original;
    if (options.extraSpaces === "remove_all") {
        result = normalizeTagHeaderSpaces(result);
    }
    result = result.replace(/\s*=\s*/g, options.spacesAroundAttributeEquals ? " = " : "=");

    if (tag.selfClosing) {
        result = result.replace(/[ \t]*\/>$/, options.spaceBeforeSelfClosing ? " />" : "/>");
    } else if (tag.attributes.length > 0) {
        result = result.replace(/[ \t]*>$/, options.spaceAfterLastAttribute ? " >" : ">");
    }

    return result;
}

function formatAttribute(attribute: TagAttribute, options: HtmlFormattingOptions): string {
    if (attribute.value === undefined) {
        return attribute.name;
    }

    const equals = options.spacesAroundAttributeEquals ? " = " : "=";
    return `${attribute.name}${equals}${attribute.value}`;
}

function getTagClose(tag: ParsedTag, options: HtmlFormattingOptions): string {
    if (tag.selfClosing) {
        return options.spaceBeforeSelfClosing ? " />" : "/>";
    }
    return options.spaceAfterLastAttribute ? " >" : ">";
}

function getAttributeIndent(baseIndent: string, tagName: string, options: HtmlFormattingOptions): string {
    const indentUnit = options.indentation.style === "tab" ? "\t" : " ".repeat(options.indentation.size);
    if (options.attributeIndent === "double_indent") {
        return baseIndent + indentUnit.repeat(2);
    }
    if (options.attributeIndent === "align_by_first_attribute") {
        return baseIndent + " ".repeat(tagName.length + 2);
    }
    return baseIndent + indentUnit;
}

function formatElementBoundaries(source: string, options: HtmlFormattingOptions, lineEnding: string): string {
    const tags = scanTags(source);
    const stack: TagRange[] = [];
    const insertions = new Set<number>();

    for (const range of tags) {
        if (!range.tag.closing) {
            if (shouldBreakBeforeTag(source, range, options)) {
                insertions.add(range.start);
            }
            if (!range.tag.selfClosing) {
                stack.push(range);
            }
            continue;
        }

        const openingIndex = findMatchingOpeningTag(stack, range.tag.name);
        if (openingIndex < 0) {
            continue;
        }
        const opening = stack.splice(openingIndex, 1)[0];
        const innerContent = source.slice(opening.end, range.start);
        const hasChildElements = scanTags(innerContent).length > 0;
        const hasDirectText = hasDirectTextContent(innerContent);
        const isMultiline = /\r\n|\n|\r/.test(source.slice(opening.start, range.end));
        const breakInside =
            (options.lineBreaksInsideElementsWithChildElements && hasChildElements && !hasDirectText) ||
            (options.lineBreaksInsideMultilineElements && isMultiline);

        if (breakInside) {
            insertions.add(opening.end);
            insertions.add(range.start);
            if (options.lineBreaksInsideElementsWithChildElements && !hasDirectText) {
                for (const childStart of findTopLevelChildStarts(innerContent, opening.end)) {
                    insertions.add(childStart);
                }
            }
        }
    }

    return applyLineBreakInsertions(source, insertions, lineEnding);
}

function hasDirectTextContent(source: string): boolean {
    const tags = scanTags(source);
    let depth = 0;
    let cursor = 0;

    for (const range of tags) {
        if (depth === 0 && source.slice(cursor, range.start).trim().length > 0) {
            return true;
        }
        if (range.tag.closing) {
            depth = Math.max(0, depth - 1);
        } else if (!range.tag.selfClosing) {
            depth++;
        }
        cursor = range.end;
    }

    return depth === 0 && source.slice(cursor).trim().length > 0;
}

function findTopLevelChildStarts(source: string, offset: number): number[] {
    const starts: number[] = [];
    let depth = 0;

    for (const range of scanTags(source)) {
        if (!range.tag.closing && depth === 0) {
            starts.push(offset + range.start);
        }
        if (range.tag.closing) {
            depth = Math.max(0, depth - 1);
        } else if (!range.tag.selfClosing) {
            depth++;
        }
    }

    return starts;
}

function shouldBreakBeforeTag(source: string, range: TagRange, options: HtmlFormattingOptions): boolean {
    if (!options.lineBreakBeforeAllElements && !options.lineBreakBeforeMultilineElements) {
        return false;
    }
    if (!options.lineBreakBeforeAllElements && !/\r\n|\n|\r/.test(range.tag.original)) {
        return false;
    }

    const lineStart = Math.max(source.lastIndexOf("\n", range.start - 1), source.lastIndexOf("\r", range.start - 1)) + 1;
    return source.slice(lineStart, range.start).trim().length > 0;
}

function findMatchingOpeningTag(stack: readonly TagRange[], name: string): number {
    for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].tag.name.toLowerCase() === name.toLowerCase()) {
            return index;
        }
    }
    return -1;
}

function applyLineBreakInsertions(source: string, insertions: ReadonlySet<number>, lineEnding: string): string {
    return [...insertions]
        .sort((left, right) => right - left)
        .reduce((result, index) => {
            const before = result.slice(0, index).replace(/[ \t]+$/, "");
            const after = result.slice(index).replace(/^[ \t]+/, "");
            if (before.endsWith("\n") || before.endsWith("\r") || after.startsWith("\n") || after.startsWith("\r")) {
                return before + after;
            }
            return before + lineEnding + after;
        }, source);
}

function limitBlankLinesBetweenTags(source: string, maximum: number, lineEnding: string): string {
    const lines = source.split(/\r\n|\n|\r/);
    const result: string[] = [];

    for (let index = 0; index < lines.length; index++) {
        if (lines[index].trim().length > 0) {
            result.push(lines[index]);
            continue;
        }

        const blankStart = index;
        while (index + 1 < lines.length && lines[index + 1].trim().length === 0) {
            index++;
        }
        const previous = result.at(-1)?.trim() ?? "";
        const next = lines[index + 1]?.trim() ?? "";
        const count =
            previous.endsWith(">") && next.startsWith("<") ? Math.min(maximum, index - blankStart + 1) : index - blankStart + 1;
        result.push(...Array<string>(count).fill(""));
    }

    return result.join(lineEnding);
}

function scanTags(source: string): TagRange[] {
    const result: TagRange[] = [];
    let cursor = 0;

    while (cursor < source.length) {
        const start = source.indexOf("<", cursor);
        if (start < 0) {
            break;
        }
        if (source.startsWith("<!--", start)) {
            const commentEnd = source.indexOf("-->", start + 4);
            cursor = commentEnd < 0 ? source.length : commentEnd + 3;
            continue;
        }

        const end = findTagEnd(source, start + 1);
        if (end < 0) {
            break;
        }
        const original = source.slice(start, end + 1);
        const tag = parseTag(original);
        if (tag) {
            result.push({ start, end: end + 1, tag });
        }
        cursor = end + 1;
    }

    return result;
}

function parseTag(original: string): ParsedTag | undefined {
    if (/^<!|^<\?/.test(original)) {
        return undefined;
    }

    const closingMatch = /^<\/\s*([A-Za-z][\w:.-]*)\s*>$/.exec(original);
    if (closingMatch) {
        return { name: closingMatch[1], attributes: [], closing: true, selfClosing: false, original };
    }

    const openingMatch = /^<\s*([A-Za-z][\w:.-]*)([\s\S]*?)>$/.exec(original);
    if (!openingMatch) {
        return undefined;
    }

    const selfClosing = /\/\s*>$/.test(original);
    const attributeSource = openingMatch[2].replace(/\/\s*$/, "").trim();
    return {
        name: openingMatch[1],
        attributes: parseAttributes(attributeSource),
        closing: false,
        selfClosing,
        original,
    };
}

function parseAttributes(source: string): TagAttribute[] {
    const attributes: TagAttribute[] = [];
    let cursor = 0;

    while (cursor < source.length) {
        while (/\s/.test(source[cursor] ?? "")) {
            cursor++;
        }
        if (cursor >= source.length) {
            break;
        }

        const nameStart = cursor;
        while (cursor < source.length && !/[\s=]/.test(source[cursor])) {
            cursor++;
        }
        const name = source.slice(nameStart, cursor);
        while (/\s/.test(source[cursor] ?? "")) {
            cursor++;
        }
        if (source[cursor] !== "=") {
            attributes.push({ name });
            continue;
        }

        cursor++;
        while (/\s/.test(source[cursor] ?? "")) {
            cursor++;
        }
        const valueStart = cursor;
        cursor = findAttributeValueEnd(source, cursor);
        attributes.push({ name, value: source.slice(valueStart, cursor) });
    }

    return attributes;
}

function findAttributeValueEnd(source: string, start: number): number {
    const quote = source[start] === '"' || source[start] === "'" ? source[start] : undefined;
    if (quote) {
        let cursor = start + 1;
        while (cursor < source.length) {
            if (source[cursor] === quote) {
                return cursor + 1;
            }
            cursor++;
        }
        return source.length;
    }

    let cursor = start;
    while (cursor < source.length && !/\s/.test(source[cursor])) {
        cursor++;
    }
    return cursor;
}

function findProtectedElementRanges(source: string, elements: ReadonlySet<string>): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    for (const element of elements) {
        const pattern = new RegExp(`<${escapeRegExp(element)}\\b[\\s\\S]*?<\\/${escapeRegExp(element)}\\s*>`, "gi");
        for (const match of source.matchAll(pattern)) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
        }
    }
    return ranges;
}

function normalizeTagHeaderSpaces(tag: string): string {
    if (/\r\n|\n|\r/.test(tag)) {
        return tag
            .split(/(\r\n|\n|\r)/)
            .map(part => {
                if (/^(?:\r\n|\n|\r)$/.test(part)) {
                    return part;
                }
                const leadingWhitespace = /^[ \t]*/.exec(part)?.[0] ?? "";
                return leadingWhitespace + part.slice(leadingWhitespace.length).replace(/[ \t]+/g, " ");
            })
            .join("");
    }

    let result = "";
    let quote: string | undefined;
    let pendingSpace = false;

    for (const character of tag) {
        if (quote) {
            result += character;
            if (character === quote) {
                quote = undefined;
            }
            continue;
        }
        if (character === '"' || character === "'") {
            if (pendingSpace && result && !result.endsWith("<")) {
                result += " ";
            }
            pendingSpace = false;
            quote = character;
            result += character;
        } else if (/\s/.test(character)) {
            pendingSpace = true;
        } else {
            if (pendingSpace && result && !/[<=/]$/.test(result)) {
                result += " ";
            }
            pendingSpace = false;
            result += character;
        }
    }

    return result;
}

function findTagEnd(source: string, start: number): number {
    let quote: string | undefined;
    for (let index = start; index < source.length; index++) {
        const character = source[index];
        if (quote) {
            if (character === quote) {
                quote = undefined;
            }
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === ">") {
            return index;
        }
    }
    return -1;
}

function getLineIndent(source: string, index: number): string {
    const lineStart = Math.max(source.lastIndexOf("\n", index - 1), source.lastIndexOf("\r", index - 1)) + 1;
    return /^[ \t]*/.exec(source.slice(lineStart, index))?.[0] ?? "";
}

function protectRanges(
    source: string,
    ranges: readonly { start: number; end: number }[],
): { readonly source: string; readonly values: readonly string[] } {
    const indexedRanges = [...ranges]
        .sort((left, right) => left.start - right.start)
        .map((range, index) => ({ ...range, index }));
    const values = indexedRanges.map(range => source.slice(range.start, range.end));
    const protectedSource = [...indexedRanges]
        .sort((left, right) => right.start - left.start)
        .reduce((result, range) => {
            return result.slice(0, range.start) + `\uE000${range.index}\uE001` + result.slice(range.end);
        }, source);
    return { source: protectedSource, values };
}

function restoreProtectedContent(source: string, values: readonly string[]): string {
    return source.replace(/\uE000(\d+)\uE001/g, (_, index: string) => values[Number.parseInt(index, 10)] ?? "");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
