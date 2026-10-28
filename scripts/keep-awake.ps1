# Keeps Windows awake while a long command runs, then lets it sleep again.
#   .\scripts\keep-awake.ps1 -Run "uv run pytest -q"
#   .\scripts\keep-awake.ps1 -Minutes 90        # no command: stay awake for a while
param(
    [string]$Run = "",
    [int]$Minutes = 0
)

Add-Type -Namespace Forja -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
'@
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED: the system stays on, the screen may turn off.
$keep = [uint32]"0x80000001"
$release = [uint32]"0x80000000"

[Forja.Power]::SetThreadExecutionState($keep) | Out-Null
$code = 0
try {
    if ($Run) {
        Invoke-Expression $Run
        $code = $LASTEXITCODE
    }
    elseif ($Minutes -gt 0) {
        Start-Sleep -Seconds ($Minutes * 60)
    }
}
finally {
    [Forja.Power]::SetThreadExecutionState($release) | Out-Null
}
exit $code
