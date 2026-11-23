# Converts the 1024px source PNGs into the 512px JPEGs the page uses (art/<card id>.jpg).
# Usage: powershell -File tools\make-art.ps1 -SourceDir "C:\path\to\ProtoType Art"
param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [string]$OutDir = '',
  [int]$Size = 512,
  [int]$Quality = 82
)
Add-Type -AssemblyName System.Drawing
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\art' }

# source file name (without .png) -> card id used by the game
$map = [ordered]@{
  'Fledgeling'    = 'fledgling'
  'Duelist'       = 'duelist'
  'Marksman'      = 'marksman'
  'Frostcaller'   = 'frostcaller'
  'Sand Conjurer' = 'conjurer'
  'Herald'        = 'herald'
  'Drillmaster'   = 'drillmaster'
  'Pikeman'       = 'pikeman'
  'Treasurer'     = 'treasurer'
  'Chronomancer'  = 'chronomancer'
  'Warlord'       = 'warlord'
  'Troll'         = 'troll'
}
# The Sandling token has no art of its own: use a square crop (x, y, size on the 1024px source) of the Sand Conjurer's sand swirl.
$sandlingCrop = @{ Source = 'Sand Conjurer'; X = 30; Y = 430; Side = 480 }

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Save-Resized($srcPath, $outPath, $srcRect) {
  $src = [System.Drawing.Image]::FromFile($srcPath)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $dest = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $g.DrawImage($src, $dest, $srcRect.X, $srcRect.Y, $srcRect.W, $srcRect.H, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save($outPath, $enc, $ep)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}

foreach ($name in $map.Keys) {
  $in = Join-Path $SourceDir "$name.png"
  $out = Join-Path $OutDir "$($map[$name]).jpg"
  Save-Resized $in $out @{ X = 0; Y = 0; W = 1024; H = 1024 }
  Write-Host ("{0,-14} -> {1} ({2} KB)" -f $name, (Split-Path $out -Leaf), [math]::Round((Get-Item $out).Length / 1KB))
}
$c = $sandlingCrop
Save-Resized (Join-Path $SourceDir "$($c.Source).png") (Join-Path $OutDir 'sandling.jpg') @{ X = $c.X; Y = $c.Y; W = $c.Side; H = $c.Side }
Write-Host ("{0,-14} -> sandling.jpg ({1} KB)" -f 'Sandling crop', [math]::Round((Get-Item (Join-Path $OutDir 'sandling.jpg')).Length / 1KB))
