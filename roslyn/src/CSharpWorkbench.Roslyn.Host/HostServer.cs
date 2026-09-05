using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using System.Threading.Channels;
using CSharpWorkbench.Roslyn.Core;
using CSharpWorkbench.Roslyn.Core.Errors;
using CSharpWorkbench.Roslyn.Core.Formatting;
using CSharpWorkbench.Roslyn.Host.Protocol;

namespace CSharpWorkbench.Roslyn.Host;

public sealed class HostServer
{
    public const int ProtocolVersion = 1;

    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly WireReader _reader;
    private readonly WireWriter _writer;
    private readonly TextWriter _error;
    private readonly CSharpRoslynFormatter _formatter = new();
    private readonly ConcurrentDictionary<int, CancellationTokenSource> _requests = new();
    private readonly ConcurrentDictionary<int, Task> _requestTasks = new();
    private readonly Channel<WireResponse> _responses = Channel.CreateUnbounded<WireResponse>(
        new UnboundedChannelOptions
        { SingleReader = true,
            SingleWriter = false });
    private volatile bool _ready;
    private volatile bool _shuttingDown;

    public HostServer(Stream input, Stream output, TextWriter error)
    {
        _reader = new WireReader(input);
        _writer = new WireWriter(output);
        _error = error ?? throw new ArgumentNullException(nameof(error));
    }

    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        var writerTask = WriteResponsesAsync(cancellationToken);
        try
        {
            while (!_shuttingDown)
            {
                var frame = await _reader.ReadFrameAsync(cancellationToken).ConfigureAwait(false);
                if (frame is null)
                {
                    break;
                }

                try
                {
                    await DispatchAsync(frame).ConfigureAwait(false);
                }
                catch (WireProtocolException exception)
                {
                    await QueueErrorAsync(null, exception.Code, exception.Message).ConfigureAwait(false);
                }
            }
        }
        catch (WireProtocolException exception)
        {
            await QueueErrorAsync(null, exception.Code, exception.Message).ConfigureAwait(false);
        }
        catch (OperationCanceledException)when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)when (exception is not OutOfMemoryException)
        {
            await _error.WriteLineAsync(exception.ToString()).ConfigureAwait(false);
            await QueueErrorAsync(null, "internalError", "The host encountered an unexpected error.").ConfigureAwait(false);
        }
        finally
        {
            _shuttingDown = true;
            await CancelAndWaitForRequestsAsync().ConfigureAwait(false);
            _responses.Writer.TryComplete();
            await writerTask.ConfigureAwait(false);
        }

        return 0;
    }

    private async Task DispatchAsync(byte[] frame)
    {
        WireMessage? message;
        try
        {
            message = JsonSerializer.Deserialize<WireMessage>(frame, SerializerOptions);
        }
        catch (JsonException exception)
        {
            await QueueErrorAsync(null, "invalidMessage", "Frame body must contain valid JSON.").ConfigureAwait(false);
            await _error.WriteLineAsync(exception.Message).ConfigureAwait(false);
            return;
        }

        if (message?.Method is null)
        {
            await QueueErrorAsync(message?.Id, "invalidRequest", "Request method is required.").ConfigureAwait(false);
            return;
        }

        try
        {
            switch (message.Method)
            {
                case "handshake":
                    await HandleHandshakeAsync(message).ConfigureAwait(false);
                    break;
                case "format":
                    HandleFormat(message);
                    break;
                case "cancel":
                    HandleCancel(message);
                    break;
                case "shutdown":
                    await HandleShutdownAsync(message).ConfigureAwait(false);
                    break;
                default:
                    await QueueErrorAsync(message.Id, "methodNotFound",
                        $"Unknown method: {message.Method}.").ConfigureAwait(false);
                    break;
            }
        }
        catch (WireProtocolException exception)
        {
            await QueueErrorAsync(message.Id, exception.Code, exception.Message).ConfigureAwait(false);
        }
    }

    private async Task HandleHandshakeAsync(WireMessage message)
    {
        if (!message.Id.HasValue)
        {
            await QueueErrorAsync(null, "invalidRequest", "Handshake request id is required.").ConfigureAwait(false);
            return;
        }

        var parameters = DeserializeParams<WireHandshakeParams>(message.Params);
        if (parameters.ProtocolVersion != ProtocolVersion)
        {
            await QueueErrorAsync(
                message.Id,
                "protocolVersionMismatch",
                $"Protocol version {parameters.ProtocolVersion} is incompatible with version {ProtocolVersion}.")
            .ConfigureAwait(false);
            return;
        }

        _ready = true;
        var info = CSharpRoslynCoreInfo.Current;
        await QueueResultAsync(message.Id.Value, new
            {
                protocolVersion = ProtocolVersion,
                backendName = "standalone-roslyn",
                backendVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "unknown",
                coreVersion = info.CoreVersion,
                roslynVersion = info.RoslynVersion,
                capabilities = new
                {
                    formatDocument = info.Capabilities.FormatDocument,
                    formatRange = info.Capabilities.FormatRange,
                    formatSnippet = info.Capabilities.FormatSnippet,
                    snippetKinds = info.Capabilities.SnippetKinds.Select(MapSnippetKind).ToArray(),
                    supportsMaxLineLength = info.Capabilities.SupportsMaxLineLength,
                    supportsEncodingConversion = info.Capabilities.SupportsEncodingConversion,
                    supportsIndependentEventIndexerAndLocalFunctionBraceContexts =
                    info.Capabilities.SupportsIndependentEventIndexerAndLocalFunctionBraceContexts,
                    preservesSourceOnFailure = info.Capabilities.PreservesSourceOnFailure,
                },
        }).ConfigureAwait(false);
    }

    private void HandleFormat(WireMessage message)
    {
        if (!message.Id.HasValue)
        {
            _ = QueueErrorAsync(null, "invalidRequest", "Format request id is required.");
            return;
        }

        if (!_ready)
        {
            _ = QueueErrorAsync(message.Id, "handshakeRequired", "A successful handshake is required before formatting.");
            return;
        }

        if (_shuttingDown)
        {
            _ = QueueErrorAsync(message.Id, "invalidRequest", "The host is shutting down.");
            return;
        }

        var cancellation = new CancellationTokenSource();
        if (!_requests.TryAdd(message.Id.Value, cancellation))
        {
            cancellation.Dispose();
            _ = QueueErrorAsync(message.Id, "invalidRequest", $"Request id {message.Id.Value} is already active.");
            return;
        }

        var task = Task.Run(() => ProcessFormatAsync(message, cancellation));
        _requestTasks[message.Id.Value] = task;
    }

    private async Task ProcessFormatAsync(WireMessage message, CancellationTokenSource cancellation)
    {
        try
        {
            var wireRequest = DeserializeParams<WireFormattingRequest>(message.Params);
            var coreRequest = FormattingRequestMapper.ToCore(wireRequest);
            var result = await _formatter.FormatAsync(coreRequest, cancellation.Token).ConfigureAwait(false);
            await QueueResultAsync(message.Id!.Value, FormattingRequestMapper.ToWire(result)).ConfigureAwait(false);
        }
        catch (OperationCanceledException)when (cancellation.IsCancellationRequested)
        {
            await QueueErrorAsync(message.Id, "requestCancelled", "Request was cancelled.").ConfigureAwait(false);
        }
        catch (WireProtocolException exception)
        {
            await QueueErrorAsync(message.Id, exception.Code, exception.Message).ConfigureAwait(false);
        }
        catch (CSharpFormattingException exception)
        {
            await QueueErrorAsync(message.Id, MapCoreError(exception.Code), exception.Message).ConfigureAwait(false);
        }
        catch (Exception exception)when (exception is not OutOfMemoryException)
        {
            await _error.WriteLineAsync(exception.ToString()).ConfigureAwait(false);
            await QueueErrorAsync(message.Id, "internalError",
                "The host encountered an unexpected error.").ConfigureAwait(false);
        }
        finally
        {
            _requests.TryRemove(message.Id!.Value, out _);
            _requestTasks.TryRemove(message.Id.Value, out _);
            cancellation.Dispose();
        }
    }

    private void HandleCancel(WireMessage message)
    {
        try
        {
            var parameters = DeserializeParams<WireCancelParams>(message.Params);
            if (_requests.TryGetValue(parameters.Id, out var cancellation))
            {
                cancellation.Cancel();
            }
        }
        catch (WireProtocolException)
        {
        }
    }

    private async Task HandleShutdownAsync(WireMessage message)
    {
        if (!message.Id.HasValue)
        {
            await QueueErrorAsync(null, "invalidRequest", "Shutdown request id is required.").ConfigureAwait(false);
            return;
        }

        _shuttingDown = true;
        await CancelAndWaitForRequestsAsync().ConfigureAwait(false);
        await QueueResultAsync(message.Id.Value, new
            { }).ConfigureAwait(false);
    }

    private async Task CancelAndWaitForRequestsAsync()
    {
        foreach (var cancellation in _requests.Values)
        {
            cancellation.Cancel();
        }

        var tasks = _requestTasks.Values.ToArray();
        if (tasks.Length > 0)
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
    }

    private async Task WriteResponsesAsync(CancellationToken cancellationToken)
    {
        await foreach (var response in _responses.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            await _writer.WriteAsync(response, cancellationToken).ConfigureAwait(false);
        }
    }

    private ValueTask QueueResultAsync(int id, object result)
    {
        return _responses.Writer.WriteAsync(new WireResponse
            { Id = id,
                Result = result });
    }

    private ValueTask QueueErrorAsync(int? id, string code, string message)
    {
        return _responses.Writer.WriteAsync(new WireResponse
            {
                Id = id,
                Error = new WireError
                { Code = code,
                    Message = message },
        });
    }

    private static T DeserializeParams<T>(JsonElement parameters)
    {
        if (parameters.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            throw new WireProtocolException("invalidRequest", "Request params are required.");
        }

        try
        {
            return parameters.Deserialize<T>(SerializerOptions)
            ?? throw new WireProtocolException("invalidRequest", "Request params are invalid.");
        }
        catch (JsonException exception)
        {
            throw new WireProtocolException("invalidRequest", "Request params are invalid.", exception);
        }
    }

    private static string MapSnippetKind(CSharpWorkbench.Roslyn.Core.Contracts.CSharpSnippetKind kind)
    {
        return kind switch
        {
            CSharpWorkbench.Roslyn.Core.Contracts.CSharpSnippetKind.TypeMembers => "type-members",
            CSharpWorkbench.Roslyn.Core.Contracts.CSharpSnippetKind.Statements => "statements",
            _ => throw new InvalidOperationException($"Unknown snippet kind: {kind}."),
        };
    }

    private static string MapCoreError(CSharpFormattingErrorCode code)
    {
        return code switch
        {
            CSharpFormattingErrorCode.InvalidRequest => "invalidRequest",
            CSharpFormattingErrorCode.InvalidSpan => "invalidSpan",
            CSharpFormattingErrorCode.InvalidConfiguration => "invalidConfiguration",
            CSharpFormattingErrorCode.ParseFailure => "parseFailure",
            CSharpFormattingErrorCode.FormattingFailure => "formattingFailure",
            _ => "internalError",
        };
    }
}
