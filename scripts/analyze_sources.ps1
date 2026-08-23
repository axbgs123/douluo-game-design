param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDirectory,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
[System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)

$sourceSpecs = @(
    @{ File = '《斗罗大陆》.txt'; Encoding = 'unicode' },
    @{ File = '《斗罗大陆2绝世唐门》.txt'; Encoding = 'unicode' },
    @{ File = '《斗罗大陆3龙王传说》.txt'; Encoding = 'unicode' },
    @{ File = '《斗罗大陆4终极斗罗》.txt'; Encoding = 'gb18030' },
    @{ File = '《斗罗大陆外传神界传说》.txt'; Encoding = 'gb18030' }
)

$terms = @(
    '武魂', '魂师', '魂力', '魂环', '魂骨', '魂兽', '魂导器', '斗铠',
    '史莱克学院', '唐门', '武魂殿', '传灵塔', '神界', '深渊位面', '斗罗联邦',
    '唐三', '小舞', '戴沐白', '朱竹清', '奥斯卡', '宁荣荣', '马红俊',
    '比比东', '千仞雪', '霍雨浩', '王冬儿', '唐舞桐', '帝天',
    '唐舞麟', '古月娜', '谢邂', '原恩夜辉', '蓝轩宇', '白秀秀'
)

function Get-TextEncoding([string]$name) {
    if ($name -eq 'unicode') {
        return [System.Text.Encoding]::Unicode
    }
    return [System.Text.Encoding]::GetEncoding('GB18030')
}

$analysis = foreach ($spec in $sourceSpecs) {
    $path = Join-Path $SourceDirectory $spec.File
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing source file: $path"
    }

    $encoding = Get-TextEncoding $spec.Encoding
    $text = [System.IO.File]::ReadAllText($path, $encoding)
    $lines = $text -split "`r?`n"
    $chapterHeadings = @(
        $lines |
            ForEach-Object { $_.Trim() } |
            Where-Object {
                $_ -match '^(第[零〇一二三四五六七八九十百千万两0-9]+[章节卷部集]|引子|楔子|序章|后记|尾声)'
            }
    )

    $termCounts = [ordered]@{}
    foreach ($term in $terms) {
        $termCounts[$term] = ([regex]::Matches($text, [regex]::Escape($term))).Count
    }

    [ordered]@{
        file = $spec.File
        source_path = $path
        bytes = (Get-Item -LiteralPath $path).Length
        encoding = $encoding.WebName
        characters = $text.Length
        lines = $lines.Count
        chapter_count = $chapterHeadings.Count
        first_chapters = @($chapterHeadings | Select-Object -First 12)
        last_chapters = @($chapterHeadings | Select-Object -Last 12)
        chapter_headings = $chapterHeadings
        term_counts = $termCounts
    }
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$analysis | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "Wrote analysis for $($analysis.Count) sources to $OutputPath"
