using CSharpWorkbench.Roslyn.Host;

var server = new HostServer(
    Console.OpenStandardInput(),
    Console.OpenStandardOutput(),
    Console.Error);

return await server.RunAsync().ConfigureAwait(false);
