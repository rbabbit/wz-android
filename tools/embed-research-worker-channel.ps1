param(
	[string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$javaScriptPath = Join-Path $ProjectRoot 'app\src\main\assets\warzone\warzone2100.js'
$javaScript = [IO.File]::ReadAllText($javaScriptPath)
$marker = 'blocknight-engine-output'

$legacyFilter = 'if(blockNightOutputChannel&&text.includes("BNTECH"))blockNightOutputChannel.postMessage(text)'
$queueFilter = 'if(blockNightOutputChannel&&(text.includes("BNTECH")||text.includes("BNQUEUE")))blockNightOutputChannel.postMessage(text)'
if ($javaScript.Contains($marker)) {
	if ($javaScript.Contains($legacyFilter)) {
		$javaScript = $javaScript.Replace($legacyFilter, $queueFilter)
		[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
		Write-Output 'Upgraded the private worker channel for immediate BNQUEUE acknowledgements.'
	} else {
		Write-Output 'Block Night research worker channel is already embedded.'
	}
	exit 0
}

$original = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
$replacement = 'var out=console.log.bind(console);var blockNightOutputChannel=typeof BroadcastChannel=="function"?new BroadcastChannel("blocknight-engine-output"):null;var err=(...args)=>{console.error(...args);let text=args.join(" ");if(blockNightOutputChannel&&(text.includes("BNTECH")||text.includes("BNQUEUE")))blockNightOutputChannel.postMessage(text)};var wasmBinary;'

if (-not $javaScript.Contains($original)) {
	throw 'Could not locate the generated Emscripten stdout/stderr declarations.'
}

$javaScript = $javaScript.Replace($original, $replacement)
[IO.File]::WriteAllText($javaScriptPath, $javaScript, [Text.UTF8Encoding]::new($false))
Write-Output 'Embedded the private BNTECH worker-to-page channel.'
