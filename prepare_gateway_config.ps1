param(
    [string]$DetectQuestionRoot = 'C:\Users\Tien\Downloads\Detect_Question'
)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'gateway-config.json'
if (Test-Path -LiteralPath $configPath) { throw 'gateway-config.json already exists; it was not overwritten.' }

$values = @{}
foreach ($line in Get-Content -Encoding UTF8 -LiteralPath (Join-Path $DetectQuestionRoot '.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $key = $Matches[1]
        $value = $Matches[2]
        if ($value -match '^(["''])(.*)\1$') { $value = $Matches[2] }
        $values[$key] = $value
    }
}
# Read the explicit template, including Wi-Fi values entered by the user.
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'gateway-config.example.json') | ConvertFrom-Json
$config.apiKey = $values['AI_PROVIDER_API_KEY']
if (-not $config.apiKey) { $config.apiKey = $values['KEY4U_API_KEY'] }
if ($values['AI_PROVIDER_URL']) { $config.apiUrl = $values['AI_PROVIDER_URL'] }
if (-not $config.apiKey -or -not $values['SUPABASE_URL'] -or -not $values['SUPABASE_ANON_KEY']) {
    throw 'Provider key and public Supabase settings must exist in the source .env.'
}
$config.licenseUrl = $values['SUPABASE_URL'].TrimEnd('/') + '/functions/v1/license-session'
$config.anonKey = $values['SUPABASE_ANON_KEY']
$certDirectory = Join-Path $PSScriptRoot 'certs'
New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null

function Export-TrustedRoot([string]$Endpoint, [string]$Destination) {
    $uri = [Uri]$Endpoint
    if ($uri.Scheme -ne 'https') { throw 'Only HTTPS endpoints are supported.' }
    $tcp = [Net.Sockets.TcpClient]::new()
    $ssl = $null
    $chain = $null
    try {
        if (-not $tcp.ConnectAsync($uri.DnsSafeHost, $uri.Port).Wait(15000)) { throw 'TLS connection timed out.' }
        $tcp.ReceiveTimeout = 15000
        $tcp.SendTimeout = 15000
        # No certificate-validation bypass callback: Windows must trust both
        # the certificate chain and its match to the requested hostname.
        $ssl = [Net.Security.SslStream]::new($tcp.GetStream(), $false)
        $ssl.ReadTimeout = 15000
        $ssl.WriteTimeout = 15000
        $ssl.AuthenticateAsClient($uri.DnsSafeHost)
        $leaf = [Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
        $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
        $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(10)
        if (-not $chain.Build($leaf)) { throw 'Windows could not validate the certificate chain.' }
        $root = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
        if ($root.Subject -ne $root.Issuer) { throw 'A trusted root certificate was not found.' }
        $base64 = [Convert]::ToBase64String($root.RawData, [Base64FormattingOptions]::InsertLineBreaks)
        $pem = "-----BEGIN CERTIFICATE-----`n" + $base64 + "`n-----END CERTIFICATE-----`n"
        [IO.File]::WriteAllText($Destination, $pem, [Text.Encoding]::ASCII)
        Write-Output ('Validated TLS root for ' + $uri.DnsSafeHost)
    } finally {
        if ($chain) { $chain.Dispose() }
        if ($ssl) { $ssl.Dispose() }
        $tcp.Dispose()
    }
}

$providerCa = Join-Path $certDirectory 'provider-root-ca.pem'
$licenseCa = Join-Path $certDirectory 'supabase-root-ca.pem'
Export-TrustedRoot $config.apiUrl $providerCa
Export-TrustedRoot $config.licenseUrl $licenseCa
$config.caCertFile = $providerCa.Replace('\', '/')
$config.licenseCaFile = $licenseCa.Replace('\', '/')
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output 'Created gateway-config.json. Secrets were not printed. Nothing was sent to the board.'
