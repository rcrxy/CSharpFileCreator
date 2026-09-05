using System.Text.Json;

namespace CSharpWorkbench.Roslyn.Host.Protocol;

public sealed class WireMessage
{
    public int? Id
    { get; init; }

    public string? Method
    { get; init; }

    public JsonElement Params
    { get; init; }
}

public sealed class WireResponse
{
    public int? Id
    { get; init; }

    public object? Result
    { get; init; }

    public WireError? Error
    { get; init; }
}

public sealed class WireHandshakeParams
{
    public int ProtocolVersion
    { get; init; }
}

public sealed class WireCancelParams
{
    public int Id
    { get; init; }
}

public sealed class WireFormattingRequest
{
    public string? Kind
    { get; init; }

    public string? Source
    { get; init; }

    public WireTextSpan? Span
    { get; init; }

    public string? SnippetKind
    { get; init; }

    public WireFormattingOptions Options
    { get; init; } = new();
}

public sealed class WireTextSpan
{
    public int Start
    { get; init; }

    public int Length
    { get; init; }
}

public sealed class WireFormattingOptions
{
    public WireIndentationOptions Indentation
    { get; init; } = new();

    public int? MaxLineLength
    { get; init; }

    public WireCSharpIndentationOptions CSharpIndentation
    { get; init; } = new();

    public WireCSharpNewLineOptions CSharpNewLines
    { get; init; } = new();

    public WireCSharpSpacingOptions CSharpSpacing
    { get; init; } = new();

    public WireCSharpWrappingOptions CSharpWrapping
    { get; init; } = new();

    public string LineEnding
    { get; init; } = "\n";

    public bool InsertFinalNewline
    { get; init; }

    public bool TrimTrailingWhitespace
    { get; init; }

    public string Charset
    { get; init; } = "utf-8";
}

public sealed class WireIndentationOptions
{
    public string Style
    { get; init; } = "space";

    public int Size
    { get; init; } = 4;

    public int TabWidth
    { get; init; } = 4;
}

public sealed class WireCSharpIndentationOptions
{
    public bool IndentBlockContents
    { get; init; } = true;

    public bool IndentBraces
    { get; init; }

    public bool IndentCaseContents
    { get; init; } = true;

    public bool IndentSwitchLabels
    { get; init; } = true;

    public bool IndentCaseContentsWhenBlock
    { get; init; } = true;

    public string IndentLabels
    { get; init; } = "one_less_than_current";
}

public sealed class WireCSharpNewLineOptions
{
    public JsonElement BeforeOpenBrace
    { get; init; }

    public bool BeforeElse
    { get; init; } = true;

    public bool BeforeCatch
    { get; init; } = true;

    public bool BeforeFinally
    { get; init; } = true;

    public bool BeforeMembersInObjectInitializers
    { get; init; } = true;

    public bool BeforeMembersInAnonymousTypes
    { get; init; } = true;

    public bool BetweenQueryExpressionClauses
    { get; init; } = true;
}

public sealed class WireCSharpSpacingOptions
{
    public bool AfterControlFlowKeyword
    { get; init; } = true;

    public string AroundBinaryOperators
    { get; init; } = "before_and_after";

    public bool AfterComma
    { get; init; } = true;

    public bool BeforeComma
    { get; init; }

    public bool AfterForSemicolon
    { get; init; } = true;

    public bool BeforeForSemicolon
    { get; init; }

    public bool AfterCast
    { get; init; }

    public bool BeforeInheritanceColon
    { get; init; } = true;

    public bool AfterInheritanceColon
    { get; init; } = true;

    public bool BetweenMethodCallNameAndOpeningParenthesis
    { get; init; }

    public bool BetweenMethodCallParameterListParentheses
    { get; init; }

    public bool BetweenMethodCallEmptyParameterListParentheses
    { get; init; }

    public bool BetweenMethodDeclarationNameAndOpeningParenthesis
    { get; init; }

    public bool BetweenMethodDeclarationParameterListParentheses
    { get; init; }

    public bool BetweenMethodDeclarationEmptyParameterListParentheses
    { get; init; }

    public IReadOnlyList<string> BetweenParentheses
    { get; init; } = Array.Empty<string>();
}

public sealed class WireCSharpWrappingOptions
{
    public bool PreserveSingleLineStatements
    { get; init; } = true;

    public bool PreserveSingleLineBlocks
    { get; init; } = true;
}

public sealed class WireFormattingResult
{
    public required IReadOnlyList<WireTextChange> Changes
    { get; init; }
}

public sealed class WireTextChange
{
    public required WireTextSpan Span
    { get; init; }

    public required string NewText
    { get; init; }
}
