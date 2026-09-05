namespace CSharpWorkbench.Roslyn.Host.Protocol;

public sealed class WireProtocolException : Exception
{
    public WireProtocolException(string code, string message)
    : base(message)
    {
        Code = code;
    }

    public WireProtocolException(string code, string message, Exception innerException)
    : base(message, innerException)
    {
        Code = code;
    }

    public string Code
    { get; }
}

public sealed class WireError
{
    public required string Code
    { get; init; }

    public required string Message
    { get; init; }
}
