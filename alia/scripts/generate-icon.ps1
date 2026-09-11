# Genera build/icon.ico riproducendo il logo Alia (quadrato arrotondato +
# freccia) usato in Sidebar.jsx, come icona multi-risoluzione (16/32/48/256).
Add-Type -AssemblyName System.Drawing

function New-AliaFrame([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 32.0
    $bg = [System.Drawing.Color]::FromArgb(255, 0x45, 0xae, 0xee)
    $brush = New-Object System.Drawing.SolidBrush $bg

    $rectX = 4 * $scale
    $rectY = 4 * $scale
    $rectW = 24 * $scale
    $rectH = 24 * $scale
    $radius = 7 * $scale * 2

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rectX, $rectY, $radius, $radius, 180, 90)
    $path.AddArc($rectX + $rectW - $radius, $rectY, $radius, $radius, 270, 90)
    $path.AddArc($rectX + $rectW - $radius, $rectY + $rectH - $radius, $radius, $radius, 0, 90)
    $path.AddArc($rectX, $rectY + $rectH - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)

    $penWidth = [Math]::Max(1.0, 2.4 * $scale)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 0xe9, 0xea, 0xea)), $penWidth
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $g.DrawLine($pen, 11 * $scale, 20 * $scale, 21 * $scale, 12 * $scale)
    $g.DrawLine($pen, 21 * $scale, 12 * $scale, 21 * $scale, 18.5 * $scale)

    $g.Dispose()
    return $bmp
}

$sizes = @(16, 32, 48, 256)
$frames = $sizes | ForEach-Object { New-AliaFrame $_ }

$pngStreams = @()
foreach ($frame in $frames) {
    $ms = New-Object System.IO.MemoryStream
    $frame.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += ,$ms.ToArray()
    $ms.Dispose()
}

$outPath = Join-Path $PSScriptRoot "..\build\icon.ico"
if (Test-Path $outPath) { Remove-Item $outPath -Force }
$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter($fs)

$bw.Write([UInt16]0)      # reserved
$bw.Write([UInt16]1)      # type = icon
$bw.Write([UInt16]$sizes.Count)

$headerSize = 6 + (16 * $sizes.Count)
$offset = $headerSize
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $byteSize = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$byteSize)   # width
    $bw.Write([byte]$byteSize)   # height
    $bw.Write([byte]0)           # color palette
    $bw.Write([byte]0)           # reserved
    $bw.Write([UInt16]1)         # color planes
    $bw.Write([UInt16]32)        # bits per pixel
    $bw.Write([UInt32]$pngStreams[$i].Length)
    $bw.Write([UInt32]$offset)
    $offset += $pngStreams[$i].Length
}
foreach ($data in $pngStreams) {
    $bw.Write($data)
}
$bw.Flush()
$bw.Close()
$fs.Close()

"Icona salvata in $outPath"
