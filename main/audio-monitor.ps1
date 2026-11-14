param([int]$ParentProcessId=0)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace TrailmarkAudio {
  enum Flow { Render, Capture, All }
  enum Role { Console, Multimedia, Communications }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
    [PreserveSig] int EnumAudioEndpoints(Flow flow,uint state,out IDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(Flow flow,Role role,out IDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,out IDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index,out IDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
    [PreserveSig] int Activate(ref Guid id,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object value);
    [PreserveSig] int OpenPropertyStore(uint access,out IntPtr properties);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out uint state);
  }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionManager {
    [PreserveSig] int GetAudioSessionControl(ref Guid session,uint flags,out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(ref Guid session,uint flags,out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out ISessions sessions);
    [PreserveSig] int RegisterSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterSessionNotification(IntPtr notification);
    [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string id,IntPtr notification);
    [PreserveSig] int UnregisterDuckNotification(IntPtr notification);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index,out ISession session);
  }
  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISession {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name,ref Guid context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path,ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid grouping);
    [PreserveSig] int SetGroupingParam(ref Guid grouping,ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out uint id);
    [PreserveSig] int IsSystemSoundsSession();
    [PreserveSig] int SetDuckingPreference(bool value);
  }
  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMeter {
    [PreserveSig] int GetPeakValue(out float peak);
    [PreserveSig] int GetMeteringChannelCount(out int count);
    [PreserveSig] int GetChannelsPeakValues(int count,IntPtr values);
    [PreserveSig] int QueryHardwareSupport(out int mask);
  }
  public class Source {public uint processId;public string appName;public string title;public float peak;}
  public static class Monitor {
    static void Release(object value){if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
    public static Source[] Scan(){
      var result=new Dictionary<uint,Source>();IDevices enumerator=null;IDeviceCollection devices=null;
      try {
        enumerator=(IDevices)new DeviceEnumerator();Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(Flow.Render,1,out devices));uint count;devices.GetCount(out count);
        for(uint d=0;d<count;d++){IDevice device=null;object raw=null;ISessions sessions=null;
          try{devices.Item(d,out device);Guid id=new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");if(device.Activate(ref id,23,IntPtr.Zero,out raw)<0)continue;var manager=(ISessionManager)raw;if(manager.GetSessionEnumerator(out sessions)<0)continue;int length;sessions.GetCount(out length);
            for(int i=0;i<length;i++){ISession session=null;try{if(sessions.GetSession(i,out session)<0)continue;int state;session.GetState(out state);if(state!=1)continue;uint pid;if(session.GetProcessId(out pid)<0)continue;float peak=0;try{((IMeter)session).GetPeakValue(out peak);}catch{}string name="System sounds",title="";if(pid!=0){try{var process=Process.GetProcessById((int)pid);name=process.ProcessName;title=process.MainWindowTitle;process.Dispose();}catch{name="Application "+pid;}}
              Source existing;if(result.TryGetValue(pid,out existing)){existing.peak=Math.Max(existing.peak,peak);}else result.Add(pid,new Source{processId=pid,appName=name,title=title,peak=peak});
            }finally{Release(session);}}
          }finally{Release(sessions);Release(raw);Release(device);}
        }
      }finally{Release(devices);Release(enumerator);}
      return new List<Source>(result.Values).ToArray();
    }
  }
}
"@
while ($true) {
  if ($ParentProcessId -and -not (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
  try { $sources=@([TrailmarkAudio.Monitor]::Scan()); @{sources=$sources;error=$null} | ConvertTo-Json -Depth 4 -Compress }
  catch { @{sources=@();error=$_.Exception.Message} | ConvertTo-Json -Depth 4 -Compress }
  Start-Sleep -Milliseconds 1500
}

