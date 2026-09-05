namespace CSharpWorkbench.Roslyn.Core.Errors;

public enum CSharpFormattingErrorCode
{
    InvalidRequest,
    InvalidSpan,
    InvalidConfiguration,
    ParseFailure,
    FormattingFailure,
}

public sealed class CSharpFormattingException : Exception
{
    public CSharpFormattingException(CSharpFormattingErrorCode code, string message)
    : base(message)
    {
        Code = code;
    }

    public CSharpFormattingException(CSharpFormattingErrorCode code, string message, Exception innerException)
    : base(message, innerException)
    {
        Code = code;
    }

    public CSharpFormattingErrorCode Code
    { get; }
}
