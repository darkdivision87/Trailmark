param([int]$ParentProcessId=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$previous=@{}; $last=[DateTime]::UtcNow; $count=0; $disks=@(); $addresses=@(); $gpuError=$null
while ($true) {
  if ($ParentProcessId -and !(Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
  try {
    $now=[DateTime]::UtcNow; $seconds=[Math]::Max(.1,($now-$last).TotalSeconds); $next=@{}; $rows=@()
    foreach($p in [System.Diagnostics.Process]::GetProcesses()) {
      try {
        $pidValue=$p.Id; $start=$p.StartTime.ToUniversalTime().Ticks.ToString(); $key="$pidValue/$start"; $cpuTime=$p.TotalProcessorTime.TotalSeconds
        $cpu=0; if($previous.ContainsKey($key)) { $cpu=[Math]::Min(100,[Math]::Max(0,100*($cpuTime-$previous[$key])/$seconds/[Environment]::ProcessorCount)) }
        $next[$key]=$cpuTime
        $file=''; try { $file=$p.MainModule.FileName } catch {}
        $rows+=@{pid=$pidValue; start=$start; name=$p.ProcessName; path=$file; cpu=[Math]::Round($cpu,2); ram=$p.WorkingSet64; user=$true}
      } catch {} finally { $p.Dispose() }
    }
    $previous=$next; $last=$now
    $gpu=@{}; $gpuAvailable=$false
    try {
      $counters=Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
      foreach($c in $counters.CounterSamples) { if($c.InstanceName -match 'pid_(\d+)_' -and $c.Status -eq 0) { $idValue=$Matches[1]; $engine=$c.InstanceName -replace '^pid_\d+_',''; if(!$gpu.ContainsKey($idValue)){$gpu[$idValue]=@{}}; $gpu[$idValue][$engine]=[Math]::Max(0,[double]$c.CookedValue); $gpuAvailable=$true } }
      $gpuError=$null
    } catch { $gpuError='GPU counters are unavailable on this device.' }
    if($count%12 -eq 0) {
      $disks=@(); foreach($d in [System.IO.DriveInfo]::GetDrives()) { try { if($d.IsReady) { $disks+=@{name=$d.Name; label=$d.VolumeLabel; type=$d.DriveType.ToString(); total=$d.TotalSize; free=$d.AvailableFreeSpace} } } catch {} }
      $addresses=@(); foreach($a in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) { if($a.OperationalStatus -eq 'Up' -and $a.NetworkInterfaceType -ne 'Loopback') { foreach($ip in $a.GetIPProperties().UnicastAddresses) { if($ip.Address.AddressFamily -eq 'InterNetwork') { $addresses+=@{name=$a.Name; address=$ip.Address.ToString()} } } } }
    }
    $memory=Get-CimInstance Win32_OperatingSystem -Property TotalVisibleMemorySize,FreePhysicalMemory
    @{processes=$rows; gpu=$gpu; gpuAvailable=$gpuAvailable; gpuError=$gpuError; disks=$disks; addresses=$addresses; totalRam=[double]$memory.TotalVisibleMemorySize*1024; freeRam=[double]$memory.FreePhysicalMemory*1024; sampledAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); error=$null} | ConvertTo-Json -Compress -Depth 6 | ForEach-Object { [Console]::WriteLine($_) }
    $count++
  } catch { @{error=$_.Exception.Message} | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) } }
  Start-Sleep -Seconds 3
}
