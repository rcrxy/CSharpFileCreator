using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Text;
using CSharpWorkbench.Roslyn.Core.Contracts;

namespace CSharpWorkbench.Roslyn.Core.Formatting;

public interface ICSharpWorkbenchFormattingRule
{
    SyntaxNode Apply(
        SyntaxNode root,
        TextSpan formattingSpan,
        CSharpFormattingOptions options,
        CancellationToken cancellationToken);
}
