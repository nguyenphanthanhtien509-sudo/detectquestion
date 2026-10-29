$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$files = @(
  'src/shared/MessageActions.js',
  'src/content/core/TextUtils.js',
  'src/content/core/DomMediaExtractor.js',
  'src/content/scanner/MoodleScanner.js',
  'src/content/scanner/QuizCardScanner.js',
  'src/content/scanner/AnchorBasedScanner.js',
  'src/content/scanner/GenericDomScanner.js',
  'src/content/scanner/ExamDomScanner.js',
  'src/content/clicker/DomAnswerClicker.js',
  'src/content/solver/AdaptiveDebateApiClient.js',
  'src/content/solver/ContinuousSolveRunner.js',
  'src/content/ui/StealthToastNotifier.js',
  'src/content/ui/CaptureSelectionOverlay.js',
  'src/content/navigation/MoodleNavigationHandler.js',
  'src/content/controller/HotKeyManager.js',
  'src/content/index.js'
)

$items = foreach ($relativePath in $files) {
  $fullPath = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) { throw "Missing extension script: $relativePath" }
  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($fullPath))
  "  { relativePath: '$relativePath', base64: '$base64' }"
}

$output = Join-Path $root 'desktop\generatedExtensionParityScripts.js'
$source = @(
  "'use strict';",
  '// Generated during build. Do not edit manually.',
  'module.exports = [',
  ($items -join ",`n"),
  '];',
  ''
) -join "`n"
[IO.File]::WriteAllText($output, $source, [Text.UTF8Encoding]::new($false))
