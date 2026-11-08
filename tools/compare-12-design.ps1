# Diagnostic reference/actual comparison only. Original assets stay unchanged.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path -Parent $PSScriptRoot
$outRoot=Join-Path $taskRoot 'qa/test-12/comparisons'
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
$pairs=@(
 @('research','docs/ui-0.12/approved-research-status.png','qa/test-12/final-five/lab-12-five-research-active-only.png'),
 @('production','docs/ui-0.12/approved-production-status.png','qa/test-12/final-five/lab-12-fifth-vehicle-current-production.png')
)
foreach($pair in $pairs){
 $source=[Drawing.Image]::FromFile((Join-Path $taskRoot $pair[1]))
 $actual=[Drawing.Image]::FromFile((Join-Path $taskRoot $pair[2]))
 $bitmap=[Drawing.Bitmap]::new(1600,950)
 $g=[Drawing.Graphics]::FromImage($bitmap)
 $g.Clear([Drawing.Color]::FromArgb(8,19,24))
 $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $font=[Drawing.Font]::new('Segoe UI',17)
 $brush=[Drawing.SolidBrush]::new([Drawing.Color]::White)
 $g.DrawString('Approved mock - illustrative game state',$font,$brush,12,8)
 $g.DrawString('0.12 APK - actual native state / software emulator',$font,$brush,812,8)
 $images=@($source,$actual)
 for($i=0;$i -lt 2;$i++){
  $im=$images[$i]
  $crop=if($i -eq 0){[Drawing.RectangleF]::new(0,80,440,750)}else{[Drawing.RectangleF]::new(0,54,252,542)}
  $factor=[Math]::Min(780/$crop.Width,880/$crop.Height)
  $dest=[Drawing.RectangleF]::new([single]($i*800+8),[single]45,[single]($crop.Width*$factor),[single]($crop.Height*$factor))
  $g.DrawImage($im,$dest,$crop,[Drawing.GraphicsUnit]::Pixel)
 }
 $bitmap.Save((Join-Path $outRoot ($pair[0]+'-controls.png')),[Drawing.Imaging.ImageFormat]::Png)
 $g.Dispose();$font.Dispose();$brush.Dispose();$bitmap.Dispose();$source.Dispose();$actual.Dispose()
}
Write-Output 'Created two aspect-preserving reference/actual sidebar comparisons.'
