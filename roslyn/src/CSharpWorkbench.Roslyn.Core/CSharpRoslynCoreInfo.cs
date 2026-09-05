using System.Reflection;
using Microsoft.CodeAnalysis.CSharp;
using CSharpWorkbench.Roslyn.Core.Contracts;

namespace CSharpWorkbench.Roslyn.Core;

public sealed class CSharpRoslynCoreCapabilities
{
    internal CSharpRoslynCoreCapabilities()
    {
    }

    public bool FormatDocument => true;

    public bool FormatRange => true;

    public bool FormatSnippet => true;

    public IReadOnlyList<CSharpSnippetKind> SnippetKinds
    { get; } =
    new[]
    { CSharpSnippetKind.TypeMembers, CSharpSnippetKind.Statements };

    public bool SupportsMaxLineLength => false;

    public bool SupportsEncodingConversion => false;

    public bool SupportsIndependentEventIndexerAndLocalFunctionBraceContexts => false;

    public bool PreservesSourceOnFailure => true;
}

public sealed class CSharpRoslynCoreInfo
{
    private CSharpRoslynCoreInfo()
    {
    }

    public static CSharpRoslynCoreInfo Current
    { get; } = new();

    public string BackendName => "roslyn-core";

    public string CoreVersion => typeof(CSharpRoslynCoreInfo).Assembly.GetName().Version?.ToString() ?? "unknown";

    public string RoslynVersion => typeof(CSharpSyntaxTree).Assembly.GetName().Version?.ToString() ?? "unknown";

    public CSharpRoslynCoreCapabilities Capabilities
    { get; } = new();
}
