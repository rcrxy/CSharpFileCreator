import { parse, type Props } from "editorconfig";
import type * as vscode from "vscode";
import { resolveDefaultEditorConfigProfile } from "./defaultProfile";
import { defaultIndentationOptions } from "./defaults";
import type {
    Charset,
    CSharpBinaryOperatorSpacing,
    CSharpIndentationOptions,
    CSharpLabelIndentation,
    CSharpNewLineOptions,
    CSharpOpenBraceContext,
    CSharpSpacingOptions,
    CSharpWrappingOptions,
    EditorConfigFallback,
    HtmlAttributeIndent,
    HtmlAttributeStyle,
    HtmlAttributeWrapPolicy,
    HtmlExtraSpaces,
    HtmlFormattingOptions,
    IndentationOptions,
    IndentationStyle,
    LineEnding,
    WorkbenchEditorConfig,
} from "./models";

export async function resolveEditorConfig(
    resource: vscode.Uri,
    fallback: EditorConfigFallback = {},
): Promise<WorkbenchEditorConfig> {
    const [properties, profile] = await Promise.all([
        parseEditorConfig(resource),
        resolveDefaultEditorConfigProfile(resource, fallback.profileFileName),
    ]);
    const fixedProperties = { ...profile, ...properties };

    return {
        indentation: resolveIndentationOptions(properties, fallback, profile),
        maxLineLength: resolveMaxLineLength(properties.max_line_length, fallback.maxLineLength, profile.max_line_length),
        csharpIndentation: resolveCSharpIndentationOptions(fixedProperties),
        csharpNewLines: resolveCSharpNewLineOptions(fixedProperties),
        csharpSpacing: resolveCSharpSpacingOptions(fixedProperties),
        csharpWrapping: resolveCSharpWrappingOptions(fixedProperties),
        html: resolveHtmlFormattingOptions(properties, fallback, profile),
        lineEnding: resolveLineEnding(properties.end_of_line, fallback.lineEnding, profile.end_of_line),
        insertFinalNewline: resolveBoolean(
            properties.insert_final_newline,
            fallback.insertFinalNewline,
            resolveProfileBoolean(profile.insert_final_newline, true),
        ),
        trimTrailingWhitespace: resolveBoolean(
            properties.trim_trailing_whitespace,
            fallback.trimTrailingWhitespace,
            resolveProfileBoolean(profile.trim_trailing_whitespace, false),
        ),
        charset: resolveCharset(properties.charset, fallback.charset, profile.charset),
        properties,
    };
}

export function resolveHtmlFormattingOptions(
    properties: Readonly<Props>,
    fallback: EditorConfigFallback = {},
    profile: Readonly<Props> = {},
): HtmlFormattingOptions {
    return {
        indentation: resolveHtmlIndentationOptions(properties, fallback, profile),
        spacesAroundAttributeEquals: resolveHtmlBoolean(properties, profile, "html_spaces_around_eq_in_attribute", false),
        spaceAfterLastAttribute: resolveHtmlBoolean(properties, profile, "html_space_after_last_attribute", false),
        spaceBeforeSelfClosing: resolveHtmlBoolean(properties, profile, "html_space_before_self_closing", true),
        attributeStyle: resolveHtmlEnum(
            properties,
            profile,
            "html_attribute_style",
            ["on_single_line", "first_attribute_on_single_line", "on_different_lines", "do_not_touch"],
            "on_single_line",
        ),
        attributeWrap: resolveHtmlWrapPolicy(properties, profile),
        attributeIndent: resolveHtmlEnum(
            properties,
            profile,
            "html_attribute_indent",
            ["single_indent", "double_indent", "align_by_first_attribute"],
            "single_indent",
        ),
        maxLineLength: resolveMaxLineLength(properties.max_line_length, fallback.maxLineLength, profile.max_line_length),
        maxBlankLinesBetweenTags: resolveHtmlNonNegativeInteger(properties, profile, "html_max_blank_lines_between_tags", 1),
        lineBreakBeforeAllElements: resolveHtmlBoolean(properties, profile, "html_linebreak_before_all_elements", false),
        lineBreakBeforeMultilineElements: resolveHtmlBoolean(
            properties,
            profile,
            "html_linebreak_before_multiline_elements",
            true,
        ),
        lineBreaksInsideMultilineElements: resolveHtmlBoolean(
            properties,
            profile,
            "html_linebreaks_inside_tags_for_multiline_elements",
            true,
        ),
        lineBreaksInsideElementsWithChildElements: resolveHtmlBoolean(
            properties,
            profile,
            "html_linebreaks_inside_tags_for_elements_with_child_elements",
            true,
        ),
        noIndentInsideElements: resolveHtmlElementSet(properties, profile, "html_no_indent_inside_elements", [
            "pre",
            "textarea",
        ]),
        preserveSpacesInsideTags: resolveHtmlElementSet(properties, profile, "html_preserve_spaces_inside_tags", [
            "pre",
            "textarea",
        ]),
        extraSpaces: resolveHtmlEnum(
            properties,
            profile,
            "html_extra_spaces",
            ["remove_all", "leave_tabs", "leave_multiple", "leave_all"],
            "remove_all",
        ),
    };
}

function resolveHtmlIndentationOptions(
    properties: Readonly<Props>,
    fallback: EditorConfigFallback,
    profile: Readonly<Props>,
): IndentationOptions {
    const htmlProperties: Props = {
        indent_style:
            (resolveHtmlProperty(properties, "html_indent_style") as Props["indent_style"]) ?? properties.indent_style,
        indent_size: (resolveHtmlProperty(properties, "html_indent_size") as Props["indent_size"]) ?? properties.indent_size,
        tab_width: (resolveHtmlProperty(properties, "html_tab_width") as Props["tab_width"]) ?? properties.tab_width,
    };
    const htmlProfile: Props = {
        indent_style: (resolveHtmlProperty(profile, "html_indent_style") as Props["indent_style"]) ?? profile.indent_style,
        indent_size: (resolveHtmlProperty(profile, "html_indent_size") as Props["indent_size"]) ?? profile.indent_size,
        tab_width: (resolveHtmlProperty(profile, "html_tab_width") as Props["tab_width"]) ?? profile.tab_width,
    };
    return resolveIndentationOptions(htmlProperties, fallback, htmlProfile);
}

function resolveHtmlBoolean(
    properties: Readonly<Props>,
    profile: Readonly<Props>,
    name: string,
    defaultValue: boolean,
): boolean {
    return resolveCustomBoolean(
        resolveHtmlProperty(properties, name),
        resolveCustomBoolean(resolveHtmlProperty(profile, name), defaultValue),
    );
}

function resolveHtmlEnum<T extends string>(
    properties: Readonly<Props>,
    profile: Readonly<Props>,
    name: string,
    values: readonly T[],
    defaultValue: T,
): T {
    const profileValue = resolveHtmlProperty(profile, name);
    const profileDefault =
        typeof profileValue === "string" && values.includes(profileValue as T) ? (profileValue as T) : defaultValue;
    const value = resolveHtmlProperty(properties, name);
    return typeof value === "string" && values.includes(value as T) ? (value as T) : profileDefault;
}

function resolveHtmlWrapPolicy(properties: Readonly<Props>, profile: Readonly<Props>): HtmlAttributeWrapPolicy {
    const values: readonly HtmlAttributeWrapPolicy[] = ["off", "normal", "on_every_item", "split_into_lines"];
    const profileValue = profile.html_attribute_wrap ?? profile.ij_html_attribute_wrap;
    const propertyValue = properties.html_attribute_wrap ?? properties.ij_html_attribute_wrap;
    if (typeof propertyValue === "string" && values.includes(propertyValue as HtmlAttributeWrapPolicy)) {
        return propertyValue as HtmlAttributeWrapPolicy;
    }
    if (typeof profileValue === "string" && values.includes(profileValue as HtmlAttributeWrapPolicy)) {
        return profileValue as HtmlAttributeWrapPolicy;
    }
    return "off";
}

function resolveHtmlNonNegativeInteger(
    properties: Readonly<Props>,
    profile: Readonly<Props>,
    name: string,
    defaultValue: number,
): number {
    const value = resolveHtmlProperty(properties, name);
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        return Number.parseInt(value, 10);
    }
    const profileValue = resolveHtmlProperty(profile, name);
    if (typeof profileValue === "number" && Number.isInteger(profileValue) && profileValue >= 0) {
        return profileValue;
    }
    if (typeof profileValue === "string" && /^\d+$/.test(profileValue.trim())) {
        return Number.parseInt(profileValue, 10);
    }
    return defaultValue;
}

function resolveHtmlElementSet(
    properties: Readonly<Props>,
    profile: Readonly<Props>,
    name: string,
    defaults: readonly string[],
): ReadonlySet<string> {
    const value = resolveHtmlProperty(properties, name) ?? resolveHtmlProperty(profile, name);
    if (typeof value !== "string") {
        return new Set(defaults);
    }

    return new Set(
        value
            .split(",")
            .map(item => item.trim().toLowerCase())
            .filter(Boolean),
    );
}

function resolveHtmlProperty(properties: Readonly<Props>, name: string): unknown {
    return properties[name] ?? properties[`resharper_${name}`];
}

export function resolveMaxLineLength(value: unknown, fallback?: number, profileValue?: unknown): number | undefined {
    if (value === "off") {
        return undefined;
    }

    return (
        positiveInteger(value) ??
        positiveIntegerString(value) ??
        positiveInteger(fallback) ??
        positiveInteger(profileValue) ??
        positiveIntegerString(profileValue) ??
        80
    );
}

const csharpOpenBraceContexts = new Set<CSharpOpenBraceContext>([
    "accessors",
    "anonymous_methods",
    "anonymous_types",
    "control_blocks",
    "events",
    "indexers",
    "lambdas",
    "local_functions",
    "methods",
    "object_collection_array_initializers",
    "properties",
    "types",
]);

export function resolveCSharpNewLineOptions(properties: Readonly<Props>): CSharpNewLineOptions {
    return {
        beforeOpenBrace: resolveOpenBraceContexts(properties.csharp_new_line_before_open_brace),
        beforeElse: resolveCustomBoolean(properties.csharp_new_line_before_else, true),
        beforeCatch: resolveCustomBoolean(properties.csharp_new_line_before_catch, true),
        beforeFinally: resolveCustomBoolean(properties.csharp_new_line_before_finally, true),
    };
}

export function resolveCSharpSpacingOptions(properties: Readonly<Props>): CSharpSpacingOptions {
    return {
        afterControlFlowKeyword: resolveCustomBoolean(properties.csharp_space_after_keywords_in_control_flow_statements, true),
        aroundBinaryOperators: resolveBinaryOperatorSpacing(properties.csharp_space_around_binary_operators),
        afterComma: resolveCustomBoolean(properties.csharp_space_after_comma, true),
        beforeComma: resolveCustomBoolean(properties.csharp_space_before_comma, false),
        afterForSemicolon: resolveCustomBoolean(properties.csharp_space_after_semicolon_in_for_statement, true),
        beforeForSemicolon: resolveCustomBoolean(properties.csharp_space_before_semicolon_in_for_statement, false),
        afterCast: resolveCustomBoolean(properties.csharp_space_after_cast, false),
        beforeInheritanceColon: resolveCustomBoolean(properties.csharp_space_before_colon_in_inheritance_clause, true),
        afterInheritanceColon: resolveCustomBoolean(properties.csharp_space_after_colon_in_inheritance_clause, true),
    };
}

export function resolveCSharpWrappingOptions(properties: Readonly<Props>): CSharpWrappingOptions {
    return {
        preserveSingleLineStatements: resolveCustomBoolean(properties.csharp_preserve_single_line_statements, true),
        preserveSingleLineBlocks: resolveCustomBoolean(properties.csharp_preserve_single_line_blocks, true),
    };
}

export function resolveCSharpIndentationOptions(properties: Readonly<Props>): CSharpIndentationOptions {
    return {
        indentBlockContents: resolveCustomBoolean(properties.csharp_indent_block_contents, true),
        indentBraces: resolveCustomBoolean(properties.csharp_indent_braces, false),
        indentCaseContents: resolveCustomBoolean(properties.csharp_indent_case_contents, true),
        indentSwitchLabels: resolveCustomBoolean(properties.csharp_indent_switch_labels, true),
        indentCaseContentsWhenBlock: resolveCustomBoolean(properties.csharp_indent_case_contents_when_block, true),
        indentLabels: resolveLabelIndentation(properties.csharp_indent_labels),
    };
}

export function resolveIndentationOptions(
    properties: Readonly<Props>,
    fallback: EditorConfigFallback = {},
    profile: Readonly<Props> = {},
): IndentationOptions {
    const profileSize =
        positiveInteger(profile.indent_size) ?? positiveInteger(profile.tab_width) ?? defaultIndentationOptions.size;
    const fallbackSize = positiveInteger(fallback.tabSize) ?? profileSize;
    const style = resolveIndentationStyle(properties.indent_style, fallback.insertSpaces, profile.indent_style);
    const configuredTabWidth = positiveInteger(properties.tab_width);
    const configuredIndentSize = positiveInteger(properties.indent_size);
    const tabWidth = configuredTabWidth ?? configuredIndentSize ?? fallbackSize;
    const size = configuredIndentSize ?? (properties.indent_size === "tab" ? tabWidth : fallbackSize);

    return { style, size, tabWidth };
}

export function resolveLineEnding(
    value: Props["end_of_line"],
    fallback: LineEnding | undefined = undefined,
    profileValue: Props["end_of_line"] = undefined,
): LineEnding {
    if (value === "lf") {
        return "\n";
    }

    if (value === "crlf") {
        return "\r\n";
    }

    if (fallback) {
        return fallback;
    }
    if (profileValue === "crlf") {
        return "\r\n";
    }
    return "\n";
}

export function resolveBoolean(
    value: Props["insert_final_newline"] | Props["trim_trailing_whitespace"],
    fallback: boolean | undefined,
    defaultValue: boolean,
): boolean {
    if (value === true || value === false) {
        return value;
    }

    return fallback ?? defaultValue;
}

export function resolveCharset(
    value: Props["charset"],
    fallback: Charset | undefined,
    profileValue: Props["charset"] = undefined,
): Charset {
    switch (value) {
        case "latin1":
            return "latin1";
        case "utf-16be":
            return "utf-16be";
        case "utf-16le":
            return "utf-16le";
        case "utf-8-bom":
            return "utf-8-bom";
        case "utf-8":
        default:
            return fallback ?? resolveProfileCharset(profileValue) ?? "utf-8";
    }
}

async function parseEditorConfig(resource: vscode.Uri): Promise<Props> {
    if (resource.scheme !== "file") {
        return {};
    }

    try {
        return await parse(resource.fsPath, { unset: true });
    } catch {
        return {};
    }
}

function resolveIndentationStyle(
    configuredStyle: Props["indent_style"],
    insertSpaces: boolean | undefined,
    profileStyle: Props["indent_style"],
): IndentationStyle {
    if (configuredStyle === "space") {
        return "space";
    }

    if (configuredStyle === "tab") {
        return "tab";
    }

    if (insertSpaces !== undefined) {
        return insertSpaces ? "space" : "tab";
    }

    if (profileStyle === "tab" || profileStyle === "space") {
        return profileStyle as IndentationStyle;
    }
    return defaultIndentationOptions.style;
}

function resolveProfileBoolean(value: unknown, defaultValue: boolean): boolean {
    return resolveCustomBoolean(value, defaultValue);
}

function resolveProfileCharset(value: Props["charset"]): Charset | undefined {
    return value === "latin1" || value === "utf-16be" || value === "utf-16le" || value === "utf-8-bom" || value === "utf-8"
        ? (value as Charset)
        : undefined;
}

function positiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveIntegerString(value: unknown): number | undefined {
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
        return undefined;
    }

    return positiveInteger(Number.parseInt(value, 10));
}

function resolveCustomBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === true || value === "true") {
        return true;
    }

    if (value === false || value === "false") {
        return false;
    }

    return defaultValue;
}

function resolveLabelIndentation(value: unknown): CSharpLabelIndentation {
    if (value === "flush_left" || value === "no_change") {
        return value;
    }

    return "one_less_than_current";
}

function resolveOpenBraceContexts(value: unknown): CSharpNewLineOptions["beforeOpenBrace"] {
    if (typeof value !== "string") {
        return "all";
    }

    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "all" || normalizedValue === "none") {
        return normalizedValue;
    }

    const contexts = new Set<CSharpOpenBraceContext>();
    for (const item of normalizedValue.split(",")) {
        const context = item.trim() as CSharpOpenBraceContext;
        if (csharpOpenBraceContexts.has(context)) {
            contexts.add(context);
        }
    }

    return contexts.size > 0 ? contexts : "all";
}

function resolveBinaryOperatorSpacing(value: unknown): CSharpBinaryOperatorSpacing {
    return value === "none" || value === "ignore" ? value : "before_and_after";
}
