using System.Text;
using System.Text.Json;
using CSharpWorkbench.Roslyn.Host;
using CSharpWorkbench.Roslyn.Host.Protocol;
using Xunit;

namespace CSharpWorkbench.Roslyn.Host.Tests;

public sealed class WireProtocolTests
{
    [Fact]
    public async Task WriterUsesUtf8ByteLengthAndReaderRoundTripsFrame()
    {
        await using var stream = new MemoryStream();
        var writer = new WireWriter(stream);

        await writer.WriteAsync(new WireResponse
            { Id = 1,
                Result = new
                { text = "格式化" } });
        var bytes = stream.ToArray();
        var separator = FindHeaderSeparator(bytes);
        var header = Encoding.ASCII.GetString(bytes, 0, separator);
        var bodyLength = bytes.Length - separator - 4;

        Assert.Equal($"Content-Length: {bodyLength}", header);
        stream.Position = 0;
        var body = await new WireReader(stream).ReadFrameAsync();
        Assert.NotNull(body);
        Assert.Contains("格式化", Encoding.UTF8.GetString(body), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReaderReadsMultipleFramesAndPartialStreamReads()
    {
        var first = CreateFrame("{\"id\":1}");
        var second = CreateFrame("{\"id\":2}");
        await using var stream = new PartialReadStream(first.Concat(second).ToArray(), 2);
        var reader = new WireReader(stream);

        var firstBody = await reader.ReadFrameAsync();
        var secondBody = await reader.ReadFrameAsync();
        var eof = await reader.ReadFrameAsync();

        Assert.Equal("{\"id\":1}", Encoding.UTF8.GetString(firstBody!));
        Assert.Equal("{\"id\":2}", Encoding.UTF8.GetString(secondBody!));
        Assert.Null(eof);
    }

    [Theory]
    [InlineData("Length: 2\r\n\r\n{}")]
    [InlineData("Content-Length: nope\r\n\r\n")]
    [InlineData("Content-Length: -1\r\n\r\n")]
    public async Task ReaderRejectsInvalidHeaders(string frame)
    {
        await using var stream = new MemoryStream(Encoding.ASCII.GetBytes(frame));

        var exception = await Assert.ThrowsAsync<WireProtocolException>(() => new WireReader(stream).ReadFrameAsync());

        Assert.Equal("invalidFrame", exception.Code);
    }

    [Fact]
    public async Task ReaderRejectsFramesAboveMaximumSizeWithoutAllocatingBody()
    {
        var frame = Encoding.ASCII.GetBytes($"Content-Length: {WireReader.MaxFrameSize + 1}\r\n\r\n");
        await using var stream = new MemoryStream(frame);

        var exception = await Assert.ThrowsAsync<WireProtocolException>(() => new WireReader(stream).ReadFrameAsync());

        Assert.Equal("invalidFrame", exception.Code);
        Assert.Contains("maximum", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task HostReturnsInvalidMessageForMalformedJson()
    {
        await using var input = new MemoryStream(CreateFrame("{not-json}"));
        await using var output = new MemoryStream();
        var error = new StringWriter();

        var exitCode = await new HostServer(input, output, error).RunAsync();

        Assert.Equal(0, exitCode);
        output.Position = 0;
        var body = await new WireReader(output).ReadFrameAsync();
        using var response = JsonDocument.Parse(body!);
        Assert.Equal("invalidMessage", response.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.NotEmpty(error.ToString());
    }

    private static byte[] CreateFrame(string json)
    {
        var body = Encoding.UTF8.GetBytes(json);
        return Encoding.ASCII.GetBytes($"Content-Length: {body.Length}\r\n\r\n").Concat(body).ToArray();
    }

    private static int FindHeaderSeparator(byte[] bytes)
    {
        for (var index = 0; index <= bytes.Length - 4; index++)
        {
            if (bytes[index] == '\r' && bytes[index + 1] == '\n' && bytes[index + 2] == '\r' && bytes[index + 3] == '\n')
            {
                return index;
            }
        }

        throw new InvalidOperationException("Frame header separator was not found.");
    }

    private sealed class PartialReadStream : MemoryStream
    {
        private readonly int _maximumReadSize;

        public PartialReadStream(byte[] buffer, int maximumReadSize)
        : base(buffer)
        {
            _maximumReadSize = maximumReadSize;
        }

        public override ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            return base.ReadAsync(buffer[..Math.Min(buffer.Length, _maximumReadSize)], cancellationToken);
        }
    }
}
