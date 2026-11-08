# Diagnostic comparison sheets only. Source images and product assets are read-only.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path -Parent $PSScriptRoot
$outRoot=Join-Path $taskRoot 'qa\test-11\comparisons'
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
$pairs=@(
  @('build','docs\ui-0.11\approved-build.png','qa\test-11\final-layouts\lab-11-wide-build.png'),
  @('research','docs\ui-0.11\approved-research.png','qa\test-11\final-layouts\lab-11-wide-research.png'),
  @('factory','docs\ui-0.11\approved-factory.png','qa\test-11\final-layouts\lab-11-wide-factory.png')
)
foreach($pair in $pairs){
  $sourceImage=[Drawing.Image]::FromFile((Join-Path $taskRoot $pair[1]))
  $actualImage=[Drawing.Image]::FromFile((Join-Path $taskRoot $pair[2]))
  $canvas=[Drawing.Bitmap]::new(2400,590)
  $graphics=[Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([Drawing.Color]::FromArgb(8,19,24))
  $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $font=[Drawing.Font]::new('Segoe UI',18,[Drawing.FontStyle]::Regular)
  $brush=[Drawing.SolidBrush]::new([Drawing.Color]::White)
  $graphics.DrawString('APPROVED MOCK - sample game state',$font,$brush,12,8)
  $graphics.DrawString('0.11 APK - same wide viewport; actual game state',$font,$brush,1212,8)
  $graphics.DrawImage($sourceImage,[Drawing.Rectangle]::new(0,45,1200,540))
  $graphics.DrawImage($actualImage,[Drawing.Rectangle]::new(1200,45,1200,540))
  $canvas.Save((Join-Path $outRoot ($pair[0]+'-full.png')),[Drawing.Imaging.ImageFormat]::Png)
  # Focus on the important overlay rather than emulator terrain rendering.
  $focusSource=switch($pair[0]){'build'{@(0.0,0.095,0.23,0.89)}'research'{@(0.59,0.36,0.40,0.61)}'factory'{@(0.64,0.294,0.35,0.675)}}
  $focusActual=switch($pair[0]){'build'{@(0.0,0.077,0.16,0.915)}'research'{@(0.6087,0.30,0.3863,0.689)}'factory'{@(0.619,0.225,0.373,0.76)}}
  $detail=[Drawing.Bitmap]::new(1600,820)
  $dg=[Drawing.Graphics]::FromImage($detail)
  $dg.Clear([Drawing.Color]::FromArgb(8,19,24))
  $dg.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $dg.DrawString('APPROVED MOCK - key controls',$font,$brush,12,8)
  $dg.DrawString('0.11 APK - key controls',$font,$brush,812,8)
  $images=@($sourceImage,$actualImage)
  for($i=0;$i -lt 2;$i++){
    $im=$images[$i]
    $focus=if($i -eq 0){$focusSource}else{$focusActual}
    $rect=[Drawing.RectangleF]::new([single]($im.Width*$focus[0]),[single]($im.Height*$focus[1]),[single]($im.Width*$focus[2]),[single]($im.Height*$focus[3]))
    $factor=[Math]::Min(790/$rect.Width,760/$rect.Height)
    $dest=[Drawing.RectangleF]::new([single]($i*800+5),[single]45,[single]($rect.Width*$factor),[single]($rect.Height*$factor))
    $dg.DrawImage($im,$dest,$rect,[Drawing.GraphicsUnit]::Pixel)
  }
  $detail.Save((Join-Path $outRoot ($pair[0]+'-controls.png')),[Drawing.Imaging.ImageFormat]::Png)
  $dg.Dispose();$detail.Dispose();$graphics.Dispose();$font.Dispose();$brush.Dispose();$canvas.Dispose();$sourceImage.Dispose();$actualImage.Dispose()
}
Write-Output 'Created six diagnostic design comparison sheets; source pixels are unchanged.'
