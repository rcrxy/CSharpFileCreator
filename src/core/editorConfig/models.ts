import type { Props } from "editorconfig";

export type IndentationStyle = "space" | "tab";
export type LineEnding = "\n" | "\r\n";
export type Charset = "utf-8" | "utf-8-bom" | "utf-16be" | "utf-16le" | "latin1";

export interface IndentationOptions {
    readonly style: IndentationStyle;
    readonly size: number;
    readonly tabWidth: number;
}

export type CSharpLabelIndentation = "flush_left" | "one_less_than_current" | "no_change";

export interface CSharpIndentationOptions {
    readonly indentBlockContents: boolean;
    readonly indentBraces: boolean;
    readonly indentCaseContents: boolean;
    readonly indentSwitchLabels: boolean;
    readonly indentCaseContentsWhenBlock: boolean;
    readonly indentLabels: CSharpLabelIndentation;
}

export type CSharpOpenBraceContext =
    | "accessors"
    | "anonymous_methods"
    | "anonymous_types"
    | "control_blocks"
    | "events"
    | "indexers"
    | "lambdas"
    | "local_functions"
    | "methods"
    | "object_collection_array_initializers"
    | "properties"
    | "types";

export interface CSharpNewLineOptions {
    readonly beforeOpenBrace: "all" | "none" | ReadonlySet<CSharpOpenBraceContext>;
    readonly beforeElse: boolean;
    readonly beforeCatch: boolean;
    readonly beforeFinally: boolean;
    readonly beforeMembersInObjectInitializers: boolean;
    readonly beforeMembersInAnonymousTypes: boolean;
    readonly betweenQueryExpressionClauses: boolean;
}

export type CSharpBinaryOperatorSpacing = "before_and_after" | "none" | "ignore";

export interface CSharpSpacingOptions {
    readonly afterControlFlowKeyword: boolean;
    readonly aroundBinaryOperators: CSharpBinaryOperatorSpacing;
    readonly afterComma: boolean;
    readonly beforeComma: boolean;
    readonly afterForSemicolon: boolean;
    readonly beforeForSemicolon: boolean;
    readonly afterCast: boolean;
    readonly beforeInheritanceColon: boolean;
    readonly afterInheritanceColon: boolean;
}

export interface CSharpWrappingOptions {
    readonly preserveSingleLineStatements: boolean;
    readonly preserveSingleLineBlocks: boolean;
}

export type HtmlAttributeStyle = "on_single_line" | "first_attribute_on_single_line" | "on_different_lines" | "do_not_touch";
export type HtmlAttributeWrapPolicy = "off" | "normal" | "on_every_item" | "split_into_lines";
export type HtmlAttributeIndent = "single_indent" | "double_indent" | "align_by_first_attribute";
export type HtmlExtraSpaces = "remove_all" | "leave_tabs" | "leave_multiple" | "leave_all";

export interface HtmlFormattingOptions {
    readonly indentation: IndentationOptions;
    readonly spacesAroundAttributeEquals: boolean;
    readonly spaceAfterLastAttribute: boolean;
    readonly spaceBeforeSelfClosing: boolean;
    readonly attributeStyle: HtmlAttributeStyle;
    readonly attributeWrap: HtmlAttributeWrapPolicy;
    readonly attributeIndent: HtmlAttributeIndent;
    readonly maxLineLength?: number;
    readonly maxBlankLinesBetweenTags: number;
    readonly lineBreakBeforeAllElements: boolean;
    readonly lineBreakBeforeMultilineElements: boolean;
    readonly lineBreaksInsideMultilineElements: boolean;
    readonly lineBreaksInsideElementsWithChildElements: boolean;
    readonly noIndentInsideElements: ReadonlySet<string>;
    readonly preserveSpacesInsideTags: ReadonlySet<string>;
    readonly extraSpaces: HtmlExtraSpaces;
}

export interface EditorConfigFallback {
    readonly insertSpaces?: boolean;
    readonly tabSize?: number;
    readonly maxLineLength?: number;
    readonly profileFileName?: string;
    readonly lineEnding?: LineEnding;
    readonly insertFinalNewline?: boolean;
    readonly trimTrailingWhitespace?: boolean;
    readonly charset?: Charset;
}

export interface WorkbenchEditorConfig {
    readonly indentation: IndentationOptions;
    readonly maxLineLength?: number;
    readonly csharpIndentation: CSharpIndentationOptions;
    readonly csharpNewLines: CSharpNewLineOptions;
    readonly csharpSpacing: CSharpSpacingOptions;
    readonly csharpWrapping: CSharpWrappingOptions;
    readonly html: HtmlFormattingOptions;
    readonly lineEnding: LineEnding;
    readonly insertFinalNewline: boolean;
    readonly trimTrailingWhitespace: boolean;
    readonly charset: Charset;
    readonly properties: Readonly<Props>;
}
