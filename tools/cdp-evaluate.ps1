param(
    [Parameter(Mandatory = $true)]
    [string]$Expression,
    [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'
$targets = Invoke-RestMethod "http://127.0.0.1:$Port/json"
$page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
if ($null -eq $page) {
    throw "No debuggable WebView page found on port $Port"
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
    $socket.ConnectAsync(
        [Uri]$page.webSocketDebuggerUrl,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null

    $request = @{
        id = 1
        method = 'Runtime.evaluate'
        params = @{
            expression = $Expression
            returnByValue = $true
            awaitPromise = $true
        }
    } | ConvertTo-Json -Depth 8 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($request)
    $socket.SendAsync(
        [ArraySegment[byte]]::new($bytes),
        [Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null

    $buffer = New-Object byte[] 65536
    $stream = [IO.MemoryStream]::new()
    do {
        $result = $socket.ReceiveAsync(
            [ArraySegment[byte]]::new($buffer),
            [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult()
        $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)

    $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    if ($null -ne $response.result.exceptionDetails) {
        throw ($response.result.exceptionDetails | ConvertTo-Json -Depth 8 -Compress)
    }
    $response.result.result.value
} finally {
    $socket.Dispose()
}
