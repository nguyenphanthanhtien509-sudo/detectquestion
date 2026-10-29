$ErrorActionPreference = 'Stop'
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'gateway-config.json') | ConvertFrom-Json
foreach ($pair in @(@($config.apiUrl, $config.caCertFile), @($config.licenseUrl, $config.licenseCaFile))) {
    if (-not $pair[0]) { continue }
    $uri = [Uri]$pair[0]
    if ($uri.Scheme -ne 'https') { throw 'Only HTTPS is supported.' }
    $tcp = [Net.Sockets.TcpClient]::new()
    $tls = $null
    $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
    try {
        if (-not $tcp.ConnectAsync($uri.DnsSafeHost, $uri.Port).Wait(15000)) { throw 'Connection timed out.' }
        $tls = [Net.Security.SslStream]::new($tcp.GetStream(), $false)
        $tls.ReadTimeout = 15000
        $tls.WriteTimeout = 15000
        $tls.AuthenticateAsClient($uri.DnsSafeHost)
        $leaf = [Security.Cryptography.X509Certificates.X509Certificate2]::new($tls.RemoteCertificate)
        if (-not $chain.Build($leaf)) { throw 'Certificate chain failed validation.' }
        $pem = [Text.StringBuilder]::new()
        # Include the OS-validated intermediate CAs too. Embedded clients do
        # not have Windows' cached intermediates or AIA fetching behavior.
        # Never add the server leaf as a trust anchor.
        for ($index = 1; $index -lt $chain.ChainElements.Count; $index++) {
            $certificate = $chain.ChainElements[$index].Certificate
            [void]$pem.AppendLine('-----BEGIN CERTIFICATE-----')
            [void]$pem.AppendLine([Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks))
            [void]$pem.AppendLine('-----END CERTIFICATE-----')
        }
        if ($pem.Length -gt 8000 -or $pem.Length -lt 100) { throw 'CA bundle exceeds gateway limits.' }
        [IO.File]::WriteAllText($pair[1], $pem.ToString(), [Text.Encoding]::ASCII)
        Write-Output ('Saved validated CA bundle for ' + $uri.DnsSafeHost)
    } finally {
        $chain.Dispose()
        if ($tls) { $tls.Dispose() }
        $tcp.Dispose()
    }
}
