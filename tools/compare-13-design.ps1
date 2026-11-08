# Diagnostic full-screen reference/actual comparison. No crops or asset edits.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path -Parent $PSScriptRoot
$outRoot=Join-Path $taskRoot 'qa/test-13/comparisons'
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
$paths=@('docs/ui-0.13/approved-factory.png','qa/test-13/final-max/lab-13-max-wide-vehicle.png')
$bitmap=[Drawing.Bitmap]::new(1600,405)
$g=[Drawing.Graphics]::FromImage($bitmap)
$g.Clear([Drawing.Color]::FromArgb(8,19,24))
$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font=[Drawing.Font]::new('Segoe UI',16)
$brush=[Drawing.SolidBrush]::new([Drawing.Color]::White)
$labels=@('Approved option 3 - illustrative game state','0.13 APK - actual five-factory native fixture')
for($i=0;$i -lt 2;$i++){
 $im=[Drawing.Image]::FromFile((Join-Path $taskRoot $paths[$i]))
 $g.DrawString($labels[$i],$font,$brush,($i*800+8),6)
 $factor=[Math]::Min(780/$im.Width,350/$im.Height)
 $dest=[Drawing.RectangleF]::new([single]($i*800+8),[single]40,[single]($im.Width*$factor),[single]($im.Height*$factor))
 $g.DrawImage($im,$dest,[Drawing.RectangleF]::new(0,0,$im.Width,$im.Height),[Drawing.GraphicsUnit]::Pixel)
 $im.Dispose()
}
$bitmap.Save((Join-Path $outRoot 'factory-full.png'),[Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$font.Dispose();$brush.Dispose();$bitmap.Dispose()
Write-Output 'Created aspect-preserving full-screen Factory comparison.'
