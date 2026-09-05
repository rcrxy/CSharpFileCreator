using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Text;
using CSharpWorkbench.Formatting.Core.CSharp.Options;
using CSharpWorkbench.Formatting.Core.CSharp.Rules;
using CSharpWorkbench.Formatting.Core.Errors;

namespace CSharpWorkbench.Formatting.Core.CSharp.Roslyn;

public sealed class CSharpRoslynFormatter
{
    private readonly IReadOnlyList<ICSharpWorkbenchFormattingRule> _workbenchRules;

    public CSharpRoslynFormatter(IEnumerable<ICSharpWorkbenchFormattingRule>? workbenchRules = null)
    {
        _workbenchRules = workbenchRules?.ToArray() ?? Array.Empty<ICSharpWorkbenchFormattingRule>();
    }

    public async Task<CSharpFormattingResult> FormatAsync(
        CSharpFormattingRequest request,
        CancellationToken cancellationToken = default)
    {
        CSharpFormattingRequestValidator.Validate(request);
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            return await FormatCoreAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (FormattingException)
        {
            throw;
        }
        catch (Exception exception)when (exception is not OutOfMemoryException)
        {
            throw new FormattingException(
                FormattingErrorCode.FormattingFailure,
                "Roslyn failed to format the C# source.",
                exception);
        }
    }

    private async Task<CSharpFormattingResult> FormatCoreAsync(
        CSharpFormattingRequest request,
        CancellationToken cancellationToken)
    {
        var snippetContext = request.Kind == CSharpFormattingKind.Snippet
        ? SnippetFormattingContext.Create(request)
        : null;
        var parserSource = snippetContext?.ParserSource ?? request.Source;
        var formattingSpan = request.Kind switch
        {
            CSharpFormattingKind.Document => new TextSpan(0, parserSource.Length),
            CSharpFormattingKind.Range => ToRoslynSpan(request.Span!.Value),
            CSharpFormattingKind.Snippet => snippetContext!.FormattingSpan,
            _ => throw new FormattingException(
                FormattingErrorCode.InvalidRequest,
                $"Unsupported formatting kind: {request.Kind}."),
        };

        var parseOptions = new CSharpParseOptions(LanguageVersion.Preview, DocumentationMode.Parse, SourceCodeKind.Regular);
        var syntaxTree = Parse(parserSource, parseOptions, cancellationToken);
        var root = await syntaxTree.GetRootAsync(cancellationToken).ConfigureAwait(false);

        using var workspace = new AdhocWorkspace();
        var project = workspace.AddProject(
            ProjectInfo.Create(
                ProjectId.CreateNewId(),
                VersionStamp.Create(),
                "CSharpWorkbench.Formatting.Core",
                "CSharpWorkbench.Formatting.Core",
                LanguageNames.CSharp,
                parseOptions: parseOptions));
        var originalDocument = workspace.AddDocument(
            project.Id,
            "CSharpWorkbenchDocument.cs",
            SourceText.From(parserSource));
        var ruleRoot = ApplyWorkbenchRules(root, formattingSpan, request.Options, cancellationToken);
        var ruleDocument = originalDocument.WithSyntaxRoot(ruleRoot);
        var optionSet = RoslynFormattingOptionsMapper.Apply(workspace.Options, request.Options);
        var formattedDocument = request.Kind == CSharpFormattingKind.Range
        ? await Formatter.FormatAsync(ruleDocument, formattingSpan, optionSet, cancellationToken).ConfigureAwait(false)
        : await Formatter.FormatAsync(ruleDocument, optionSet, cancellationToken).ConfigureAwait(false);
        var formattedText = await formattedDocument.GetTextAsync(cancellationToken).ConfigureAwait(false);

        return request.Kind switch
        {
            CSharpFormattingKind.Document => CreateReplacementResult(
                request.Source,
                DocumentTextNormalizer.NormalizeDocument(formattedText.ToString(), request.Options),
                new CSharpTextSpan(0, request.Source.Length)),
            CSharpFormattingKind.Range => await CreateRangeResultAsync(
                request,
                originalDocument,
                formattedDocument,
                cancellationToken).ConfigureAwait(false),
            CSharpFormattingKind.Snippet => CreateReplacementResult(
                request.Source,
                snippetContext!.Extract(formattedText.ToString(), request.Options.Indentation),
                new CSharpTextSpan(0, request.Source.Length)),
            _ => CSharpFormattingResult.Unchanged,
        };
    }

    private static SyntaxTree Parse(
        string source,
        CSharpParseOptions parseOptions,
        CancellationToken cancellationToken)
    {
        try
        {
            return CSharpSyntaxTree.ParseText(source, parseOptions, cancellationToken: cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)when (exception is not OutOfMemoryException)
        {
            throw new FormattingException(
                FormattingErrorCode.ParseFailure,
                "Roslyn failed to parse the C# source.",
                exception);
        }
    }

    private SyntaxNode ApplyWorkbenchRules(
        SyntaxNode root,
        TextSpan formattingSpan,
        CSharpFormattingOptions options,
        CancellationToken cancellationToken)
    {
        var currentRoot = root;
        foreach (var rule in _workbenchRules)
        {
            cancellationToken.ThrowIfCancellationRequested();
            currentRoot = rule.Apply(currentRoot, formattingSpan, options, cancellationToken)
            ?? throw new FormattingException(
                FormattingErrorCode.FormattingFailure,
                $"Workbench formatting rule {rule.GetType().FullName} returned no syntax root.");
        }

        if (formattingSpan.End > currentRoot.FullSpan.End)
        {
            throw new FormattingException(
                FormattingErrorCode.FormattingFailure,
            "A Workbench formatting rule produced a syntax tree shorter than the requested formatting span.");
        }

        return currentRoot;
    }

    private static async Task<CSharpFormattingResult> CreateRangeResultAsync(
        CSharpFormattingRequest request,
        Document originalDocument,
        Document formattedDocument,
        CancellationToken cancellationToken)
    {
        var targetSpan = request.Span!.Value;
        var targetEnd = targetSpan.End;
        var relativeChanges = new List<TextChange>();
        var textChanges = await formattedDocument
        .GetTextChangesAsync(originalDocument, cancellationToken)
        .ConfigureAwait(false);

        foreach (var change in textChanges)
        {
            var changeEnd = change.Span.End;
            if (change.Span.Start >= targetSpan.Start && changeEnd <= targetEnd)
            {
                relativeChanges.Add(
                    new TextChange(
                        new TextSpan(change.Span.Start - targetSpan.Start, change.Span.Length),
                        change.NewText ?? string.Empty));
                continue;
            }

            if (changeEnd <= targetSpan.Start || change.Span.Start >= targetEnd)
            {
                continue;
            }

            throw new FormattingException(
                FormattingErrorCode.FormattingFailure,
            "Roslyn returned a text change that crosses the requested range boundary.");
        }

        var originalSelection = request.Source.Substring(targetSpan.Start, targetSpan.Length);
        var formattedSelection = SourceText.From(originalSelection).WithChanges(relativeChanges).ToString();
        formattedSelection = DocumentTextNormalizer.NormalizeRange(formattedSelection, request.Options);

        return CreateReplacementResult(originalSelection, formattedSelection, targetSpan);
    }

    private static CSharpFormattingResult CreateReplacementResult(
        string originalText,
        string formattedText,
        CSharpTextSpan replacementSpan)
    {
        return string.Equals(originalText, formattedText, StringComparison.Ordinal)
        ? CSharpFormattingResult.Unchanged
        : new CSharpFormattingResult(new[]
            { new CSharpTextChange(replacementSpan, formattedText) });
    }

    private static TextSpan ToRoslynSpan(CSharpTextSpan span)
    {
        return new TextSpan(span.Start, span.Length);
    }
}
