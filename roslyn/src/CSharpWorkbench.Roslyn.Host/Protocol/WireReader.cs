using System.Globalization;
using System.Text;

namespace CSharpWorkbench.Roslyn.Host.Protocol;

public sealed class WireReader
{
    public const int MaxFrameSize = 16 * 1024 * 1024;

    private readonly Stream _stream;

    public WireReader(Stream stream)
    {
        _stream = stream ?? throw new ArgumentNullException(nameof(stream));
    }

    public async Task<byte[]?> ReadFrameAsync(CancellationToken cancellationToken = default)
    {
        var headerBytes = new List<byte>();
        while (true)
        {
            var next = new byte[1];
            var bytesRead = await _stream.ReadAsync(next, cancellationToken).ConfigureAwait(false);
            if (bytesRead == 0)
            {
                if (headerBytes.Count == 0)
                {
                    return null;
                }

                throw new WireProtocolException("invalidFrame", "Unexpected EOF while reading frame headers.");
            }

            headerBytes.Add(next[0]);
            if (headerBytes.Count > 8 * 1024)
            {
                throw new WireProtocolException("invalidFrame", "Frame headers exceed the maximum supported size.");
            }

            var count = headerBytes.Count;
            if (count >= 4 &&
                headerBytes[count - 4] == (byte)'\r' &&
                headerBytes[count - 3] == (byte)'\n' &&
                headerBytes[count - 2] == (byte)'\r' &&
                headerBytes[count - 1] == (byte)'\n')
            {
                break;
            }
        }

        var headerText = Encoding.ASCII.GetString(headerBytes.ToArray(), 0, headerBytes.Count - 4);
        var contentLength = ParseContentLength(headerText);
        var body = new byte[contentLength];
        var offset = 0;
        while (offset < body.Length)
        {
            var bytesRead = await _stream
            .ReadAsync(body.AsMemory(offset, body.Length - offset), cancellationToken)
            .ConfigureAwait(false);
            if (bytesRead == 0)
            {
                throw new WireProtocolException("invalidFrame", "Unexpected EOF while reading the frame body.");
            }

            offset += bytesRead;
        }

        return body;
    }

    private static int ParseContentLength(string headerText)
    {
        int? contentLength = null;
        foreach (var line in headerText.Split(new[]
                { "\r\n" }, StringSplitOptions.None))
        {
            var separator = line.IndexOf(':');
            if (separator <= 0)
            {
                throw new WireProtocolException("invalidFrame", "Frame contains an invalid header.");
            }

            var name = line.Substring(0, separator).Trim();
            if (!name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (contentLength.HasValue ||
                !int.TryParse(line.Substring(separator + 1).Trim(), NumberStyles.None, CultureInfo.InvariantCulture,
                    out var parsed))
            {
                throw new WireProtocolException("invalidFrame", "Content-Length must be a single non-negative integer.");
            }

            contentLength = parsed;
        }

        if (!contentLength.HasValue || contentLength.Value < 0)
        {
            throw new WireProtocolException("invalidFrame", "A valid Content-Length header is required.");
        }

        if (contentLength.Value > MaxFrameSize)
        {
            throw new WireProtocolException(
                "invalidFrame",
                $"Content-Length exceeds the {MaxFrameSize}-byte maximum frame size.");
        }

        return contentLength.Value;
    }
}
