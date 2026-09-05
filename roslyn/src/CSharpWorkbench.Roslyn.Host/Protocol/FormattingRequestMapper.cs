using System.Text.Json;
using CSharpWorkbench.Roslyn.Core.Contracts;

namespace CSharpWorkbench.Roslyn.Host.Protocol;

public static class FormattingRequestMapper
{
    public static CSharpFormattingRequest ToCore(WireFormattingRequest request)
    {
        if (request.Source is null)
        {
            throw Invalid("Format params.source is required.");
        }

        var kind = request.Kind switch
        {
            "document" => CSharpFormattingKind.Document,
            "range" => CSharpFormattingKind.Range,
            "snippet" => CSharpFormattingKind.Snippet,
            _ => throw Invalid("Format params.kind must be document, range, or snippet."),
        };
        var span = request.Span is null
        ? (CSharpTextSpan?)null
        : new CSharpTextSpan(request.Span.Start, request.Span.Length);
        var snippetKind = request.SnippetKind switch
        {
            null => (CSharpSnippetKind?)null,
            "type-members" => CSharpSnippetKind.TypeMembers,
            "statements" => CSharpSnippetKind.Statements,
            _ => throw Invalid("Format params.snippetKind must be type-members or statements."),
        };

        return new CSharpFormattingRequest(request.Source, kind, ToCore(request.Options), span, snippetKind);
    }

    public static WireFormattingResult ToWire(CSharpFormattingResult result)
    {
        return new WireFormattingResult
        {
            Changes = result.Changes.Select(change => new WireTextChange
                {
                    Span = new WireTextSpan
                    { Start = change.Span.Start,
                        Length = change.Span.Length },
                    NewText = change.NewText,
            }).ToArray(),
        };
    }

    private static CSharpFormattingOptions ToCore(WireFormattingOptions options)
    {
        return new CSharpFormattingOptions
        {
            Indentation = new IndentationOptions
            {
                Style = Parse(options.Indentation.Style, new Dictionary<string, CSharpIndentationStyle>
                    {
                        ["space"] = CSharpIndentationStyle.Space,
                        ["tab"] = CSharpIndentationStyle.Tab,
                    }, "indentation.style"),
                Size = options.Indentation.Size,
                TabWidth = options.Indentation.TabWidth,
            },
            MaxLineLength = options.MaxLineLength,
            CSharpIndentation = new CSharpIndentationOptions
            {
                IndentBlockContents = options.CSharpIndentation.IndentBlockContents,
                IndentBraces = options.CSharpIndentation.IndentBraces,
                IndentCaseContents = options.CSharpIndentation.IndentCaseContents,
                IndentSwitchLabels = options.CSharpIndentation.IndentSwitchLabels,
                IndentCaseContentsWhenBlock = options.CSharpIndentation.IndentCaseContentsWhenBlock,
                IndentLabels = Parse(options.CSharpIndentation.IndentLabels, new Dictionary<string, CSharpLabelIndentation>
                    {
                        ["flush_left"] = CSharpLabelIndentation.FlushLeft,
                        ["one_less_than_current"] = CSharpLabelIndentation.OneLessThanCurrent,
                        ["no_change"] = CSharpLabelIndentation.NoChange,
                    }, "csharpIndentation.indentLabels"),
            },
            CSharpNewLines = new CSharpNewLineOptions
            {
                BeforeOpenBrace = ParseOpenBraceMode(options.CSharpNewLines.BeforeOpenBrace),
                OpenBraceContexts = ParseList(options.CSharpNewLines.BeforeOpenBrace, OpenBraceContexts,
                    "csharpNewLines.beforeOpenBrace"),
                BeforeElse = options.CSharpNewLines.BeforeElse,
                BeforeCatch = options.CSharpNewLines.BeforeCatch,
                BeforeFinally = options.CSharpNewLines.BeforeFinally,
                BeforeMembersInObjectInitializers = options.CSharpNewLines.BeforeMembersInObjectInitializers,
                BeforeMembersInAnonymousTypes = options.CSharpNewLines.BeforeMembersInAnonymousTypes,
                BetweenQueryExpressionClauses = options.CSharpNewLines.BetweenQueryExpressionClauses,
            },
            CSharpSpacing = new CSharpSpacingOptions
            {
                AfterControlFlowKeyword = options.CSharpSpacing.AfterControlFlowKeyword,
                AroundBinaryOperators = Parse(options.CSharpSpacing.AroundBinaryOperators, new Dictionary<string,
                    CSharpBinaryOperatorSpacing>
                    {
                        ["before_and_after"] = CSharpBinaryOperatorSpacing.BeforeAndAfter,
                        ["none"] = CSharpBinaryOperatorSpacing.None,
                        ["ignore"] = CSharpBinaryOperatorSpacing.Ignore,
                    }, "csharpSpacing.aroundBinaryOperators"),
                AfterComma = options.CSharpSpacing.AfterComma,
                BeforeComma = options.CSharpSpacing.BeforeComma,
                AfterForSemicolon = options.CSharpSpacing.AfterForSemicolon,
                BeforeForSemicolon = options.CSharpSpacing.BeforeForSemicolon,
                AfterCast = options.CSharpSpacing.AfterCast,
                BeforeInheritanceColon = options.CSharpSpacing.BeforeInheritanceColon,
                AfterInheritanceColon = options.CSharpSpacing.AfterInheritanceColon,
                BetweenMethodCallNameAndOpeningParenthesis = options.CSharpSpacing.BetweenMethodCallNameAndOpeningParenthesis,
                BetweenMethodCallParameterListParentheses = options.CSharpSpacing.BetweenMethodCallParameterListParentheses,
                BetweenMethodCallEmptyParameterListParentheses = options.CSharpSpacing.BetweenMethodCallEmptyParameterListParentheses,
                BetweenMethodDeclarationNameAndOpeningParenthesis = options.CSharpSpacing.BetweenMethodDeclarationNameAndOpeningParenthesis,
                BetweenMethodDeclarationParameterListParentheses = options.CSharpSpacing.BetweenMethodDeclarationParameterListParentheses,
                BetweenMethodDeclarationEmptyParameterListParentheses = options.CSharpSpacing.BetweenMethodDeclarationEmptyParameterListParentheses,
                BetweenParentheses = options.CSharpSpacing.BetweenParentheses
                .Select(value => Parse(value, ParenthesisContexts, "csharpSpacing.betweenParentheses"))
                .ToArray(),
            },
            CSharpWrapping = new CSharpWrappingOptions
            {
                PreserveSingleLineStatements = options.CSharpWrapping.PreserveSingleLineStatements,
                PreserveSingleLineBlocks = options.CSharpWrapping.PreserveSingleLineBlocks,
            },
            LineEnding = options.LineEnding,
            InsertFinalNewline = options.InsertFinalNewline,
            TrimTrailingWhitespace = options.TrimTrailingWhitespace,
            Charset = Parse(options.Charset, Charsets, "charset"),
        };
    }

    private static CSharpOpenBraceMode ParseOpenBraceMode(JsonElement value)
    {
        if (value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return CSharpOpenBraceMode.All;
        }

        if (value.ValueKind == JsonValueKind.Array)
        {
            return CSharpOpenBraceMode.Selected;
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() switch
            {
                "all" => CSharpOpenBraceMode.All,
                "none" => CSharpOpenBraceMode.None,
                _ => throw Invalid("csharpNewLines.beforeOpenBrace must be all, none, or an array of contexts."),
            };
        }

        throw Invalid("csharpNewLines.beforeOpenBrace must be all, none, or an array of contexts.");
    }

    private static IReadOnlyList<T> ParseList<T>(JsonElement value, IReadOnlyDictionary<string, T> values, string field)
    {
        if (value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<T>();
        }

        return value.EnumerateArray()
        .Select(item => item.ValueKind == JsonValueKind.String
            ? Parse(item.GetString()!, values, field)
            : throw Invalid($"{field} must contain only strings."))
        .ToArray();
    }

    private static T Parse<T>(string value, IReadOnlyDictionary<string, T> values, string field)
    {
        return values.TryGetValue(value, out var result)
        ? result
        : throw Invalid($"Unsupported {field} value: {value}.");
    }

    private static WireProtocolException Invalid(string message) => new("invalidRequest", message);

    private static readonly IReadOnlyDictionary<string, CSharpOpenBraceContext> OpenBraceContexts =
    new Dictionary<string, CSharpOpenBraceContext>
    {
        ["accessors"] = CSharpOpenBraceContext.Accessors,
        ["anonymous_methods"] = CSharpOpenBraceContext.AnonymousMethods,
        ["anonymous_types"] = CSharpOpenBraceContext.AnonymousTypes,
        ["control_blocks"] = CSharpOpenBraceContext.ControlBlocks,
        ["events"] = CSharpOpenBraceContext.Events,
        ["indexers"] = CSharpOpenBraceContext.Indexers,
        ["lambdas"] = CSharpOpenBraceContext.Lambdas,
        ["local_functions"] = CSharpOpenBraceContext.LocalFunctions,
        ["methods"] = CSharpOpenBraceContext.Methods,
        ["object_collection_array_initializers"] = CSharpOpenBraceContext.ObjectCollectionArrayInitializers,
        ["properties"] = CSharpOpenBraceContext.Properties,
        ["types"] = CSharpOpenBraceContext.Types,
    };

    private static readonly IReadOnlyDictionary<string, CSharpParenthesisSpacingContext> ParenthesisContexts =
    new Dictionary<string, CSharpParenthesisSpacingContext>
    {
        ["control_flow_statements"] = CSharpParenthesisSpacingContext.ControlFlowStatements,
        ["expressions"] = CSharpParenthesisSpacingContext.Expressions,
        ["type_casts"] = CSharpParenthesisSpacingContext.TypeCasts,
    };

    private static readonly IReadOnlyDictionary<string, CSharpCharset> Charsets = new Dictionary<string, CSharpCharset>
    {
        ["utf-8"] = CSharpCharset.Utf8,
        ["utf-8-bom"] = CSharpCharset.Utf8Bom,
        ["utf-16be"] = CSharpCharset.Utf16BigEndian,
        ["utf-16le"] = CSharpCharset.Utf16LittleEndian,
        ["latin1"] = CSharpCharset.Latin1,
    };
}
