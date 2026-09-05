using System.Diagnostics;
using System.Text;
using System.Text.Json;
using CSharpWorkbench.Roslyn.Host.Protocol;
using Xunit;

namespace CSharpWorkbench.Roslyn.Host.Tests;

public sealed class HostProcessTests
{
    [Fact]
    public async Task ProcessSupportsHandshakeFormattingErrorsAndShutdown()
    {
        await using var host = StartHost();

        await host.SendAsync(new
            { id = 1,
                method = "format",
                @params = FormatParams("document", "class A{}") });
        AssertError(await host.ReadAsync(), 1, "handshakeRequired");

        await host.SendAsync(new
            { id = 2,
                method = "handshake",
                @params = new
                { protocolVersion = 1,
                    futureField = true } });
        using var handshake = await host.ReadAsync();
        Assert.Equal(2, handshake.RootElement.GetProperty("id").GetInt32());
        var handshakeResult = handshake.RootElement.GetProperty("result");
        Assert.Equal(1, handshakeResult.GetProperty("protocolVersion").GetInt32());
        Assert.Equal("standalone-roslyn", handshakeResult.GetProperty("backendName").GetString());
        Assert.False(string.IsNullOrWhiteSpace(handshakeResult.GetProperty("backendVersion").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(handshakeResult.GetProperty("coreVersion").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(handshakeResult.GetProperty("roslynVersion").GetString()));
        Assert.True(handshakeResult.GetProperty("capabilities").GetProperty("formatDocument").GetBoolean());
        Assert.Equal(
            new[]
            { "type-members", "statements" },
            handshakeResult.GetProperty("capabilities").GetProperty("snippetKinds").EnumerateArray().Select(item => item.GetString()));

        const string documentSource = "class Demo{void Run(){if(true){Work();}}}";
        await host.SendAsync(new
            { id = 3,
                method = "format",
                @params = FormatParams("document", documentSource, multiline: true) });
        using var document = await host.ReadAsync();
        Assert.Contains("if (true)", ApplyChanges(documentSource, document.RootElement), StringComparison.Ordinal);

        const string rangeSource = "class Demo\n{\nvoid Run(){Work();}\n}";
        var rangeStart = rangeSource.IndexOf("void", StringComparison.Ordinal);
        await host.SendAsync(new
            {
                id = 4,
                method = "format",
                @params = FormatParams("range", rangeSource, span: new
                    { start = rangeStart,
                        length = "void Run(){Work();}".Length }),
        });
        using var range = await host.ReadAsync();
        Assert.Equal(rangeStart,
            range.RootElement.GetProperty("result").GetProperty("changes")[0].GetProperty("span").GetProperty("start").GetInt32());

        await host.SendAsync(new
            { id = 5,
                method = "format",
                @params = FormatParams("snippet", "public void Run(){Work();}", "type-members", multiline: true) });
        using var typeMembers = await host.ReadAsync();
        Assert.DoesNotContain("CSharpWorkbenchSnippet", ApplyChanges("public void Run(){Work();}", typeMembers.RootElement),
            StringComparison.Ordinal);

        await host.SendAsync(new
            { id = 6,
                method = "format",
                @params = FormatParams("snippet", "if(true){Work();}", "statements", multiline: true) });
        using var statements = await host.ReadAsync();
        Assert.Contains("if (true)", ApplyChanges("if(true){Work();}", statements.RootElement), StringComparison.Ordinal);

        await host.SendAsync(new
            {
                id = 7,
                method = "format",
                @params = FormatParams("range", "class A{}", span: new
                    { start = 99,
                        length = 1 }),
        });
        AssertError(await host.ReadAsync(), 7, "invalidSpan");

        await host.SendAsync(new
            { id = 8,
                method = "unknown",
                @params = new
                { } });
        AssertError(await host.ReadAsync(), 8, "methodNotFound");
        Assert.False(host.Process.HasExited);

        await host.SendAsync(new
            { id = 9,
                method = "shutdown",
                @params = new
                { } });
        using var shutdown = await host.ReadAsync();
        Assert.Equal(9, shutdown.RootElement.GetProperty("id").GetInt32());
        Assert.True(shutdown.RootElement.TryGetProperty("result", out _));
        await host.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(0, host.Process.ExitCode);
        Assert.Equal(string.Empty, await host.Process.StandardError.ReadToEndAsync());
    }

    [Fact]
    public async Task ProcessReadsCancelWhileFormatRequestIsRunning()
    {
        await using var host = StartHost();
        await host.SendAsync(new
            { id = 1,
                method = "handshake",
                @params = new
                { protocolVersion = 1 } });
        (await host.ReadAsync()).Dispose();
        var source = "class Large{" + string.Concat(Enumerable.Range(0,
            50000).Select(index => $"void M{index}(){{int value={index}+1;}}")) + "}";

        await host.SendAsync(new
            { id = 20,
                method = "format",
                @params = FormatParams("document", source, multiline: true) });
        await Task.Delay(50);
        await host.SendAsync(new
            { method = "cancel",
                @params = new
                { id = 20 } });

        AssertError(await host.ReadAsync(TimeSpan.FromSeconds(30)), 20, "requestCancelled");
        await host.SendAsync(new
            { id = 21,
                method = "shutdown",
                @params = new
                { } });
        (await host.ReadAsync()).Dispose();
        await host.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(0, host.Process.ExitCode);
    }

    [Fact]
    public async Task ProcessExitsNormallyWhenStandardInputReachesEof()
    {
        await using var host = StartHost();

        host.Process.StandardInput.Close();

        await host.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(0, host.Process.ExitCode);
        Assert.Equal(string.Empty, await host.Process.StandardError.ReadToEndAsync());
        Assert.Equal(string.Empty, await host.Process.StandardOutput.ReadToEndAsync());
    }

    private static object FormatParams(
        string kind,
        string source,
        string? snippetKind = null,
        bool multiline = false,
        object? span = null)
    {
        return new
        {
            kind,
            source,
            snippetKind,
            span,
            options = new
            {
                csharpWrapping = new
                {
                    preserveSingleLineStatements = !multiline,
                    preserveSingleLineBlocks = !multiline,
                },
            },
        };
    }

    private static void AssertError(JsonDocument response, int id, string code)
    {
        using (response)
        {
            Assert.Equal(id, response.RootElement.GetProperty("id").GetInt32());
            Assert.Equal(code, response.RootElement.GetProperty("error").GetProperty("code").GetString());
        }
    }

    private static string ApplyChanges(string source, JsonElement response)
    {
        var changes = response.GetProperty("result").GetProperty("changes")
        .EnumerateArray()
        .Select(change => new
            {
                Start = change.GetProperty("span").GetProperty("start").GetInt32(),
                Length = change.GetProperty("span").GetProperty("length").GetInt32(),
                NewText = change.GetProperty("newText").GetString()!,
        })
        .OrderByDescending(change => change.Start);
        var result = new StringBuilder(source);
        foreach (var change in changes)
        {
            result.Remove(change.Start, change.Length);
            result.Insert(change.Start, change.NewText);
        }

        return result.ToString();
    }

    private static HostProcess StartHost()
    {
        var solutionDirectory = FindSolutionDirectory();
        var hostDll = Path.Combine(
            solutionDirectory,
            "src",
            "CSharpWorkbench.Roslyn.Host",
            "bin",
            "Release",
            "net10.0",
        "CSharpWorkbench.Roslyn.Host.dll");
        var startInfo = new ProcessStartInfo("dotnet", $"\"{hostDll}\"")
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Failed to start Roslyn Host.");
        return new HostProcess(process);
    }

    private static string FindSolutionDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "CSharpWorkbench.Roslyn.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Could not locate the Roslyn solution directory.");
    }

    private sealed class HostProcess : IAsyncDisposable
    {
        private readonly WireReader _reader;

        public HostProcess(Process process)
        {
            Process = process;
            _reader = new WireReader(process.StandardOutput.BaseStream);
        }

        public Process Process
        { get; }

        public async Task SendAsync(object message)
        {
            var body = JsonSerializer.SerializeToUtf8Bytes(message, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            var header = Encoding.ASCII.GetBytes($"Content-Length: {body.Length}\r\n\r\n");
            await Process.StandardInput.BaseStream.WriteAsync(header);
            await Process.StandardInput.BaseStream.WriteAsync(body);
            await Process.StandardInput.BaseStream.FlushAsync();
        }

        public async Task<JsonDocument> ReadAsync(TimeSpan? timeout = null)
        {
            var body = await _reader.ReadFrameAsync()
            .WaitAsync(timeout ?? TimeSpan.FromSeconds(10));
            return JsonDocument.Parse(body
                ?? throw new EndOfStreamException("Host stdout closed before a response was received."));
        }

        public async ValueTask DisposeAsync()
        {
            if (!Process.HasExited)
            {
                Process.Kill(entireProcessTree: true);
                await Process.WaitForExitAsync();
            }

            Process.Dispose();
        }
    }
}
