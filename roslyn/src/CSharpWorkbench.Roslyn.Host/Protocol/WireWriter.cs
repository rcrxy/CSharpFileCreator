using System.Text.Json;
using System.Text.Encodings.Web;

namespace CSharpWorkbench.Roslyn.Host.Protocol;

public sealed class WireWriter
{
    private static readonly byte[] HeaderSeparator = "\r\n\r\n"u8.ToArray();
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly Stream _stream;

    public WireWriter(Stream stream)
    {
        _stream = stream ?? throw new ArgumentNullException(nameof(stream));
    }

    public async Task WriteAsync(WireResponse response, CancellationToken cancellationToken = default)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(response, SerializerOptions);
        var header = System.Text.Encoding.ASCII.GetBytes($"Content-Length: {body.Length}");
        await _stream.WriteAsync(header, cancellationToken).ConfigureAwait(false);
        await _stream.WriteAsync(HeaderSeparator, cancellationToken).ConfigureAwait(false);
        await _stream.WriteAsync(body, cancellationToken).ConfigureAwait(false);
        await _stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}
