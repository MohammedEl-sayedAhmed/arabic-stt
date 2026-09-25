; Windows installer for Tafrigh (Inno Setup 6): run after `python desktop\build.py`
;   iscc desktop\installer.iss                 -> dist\Tafrigh-<version>-setup.exe
;   set TAFRIGH_VERSION=0.2.0 before, to stamp another version
; Installs for the current user (no admin rights needed). Transcriptions, keys and downloaded models live
; in %LOCALAPPDATA%\Tafrigh and are kept when the app is uninstalled.

#define AppVersion GetEnv("TAFRIGH_VERSION")
#if AppVersion == ""
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{6F3C2E9A-4B71-4D5C-9A2E-8B1F0C7D3E45}
AppName=Tafrigh
AppVersion={#AppVersion}
AppVerName=Tafrigh {#AppVersion}
DefaultDirName={autopf}\Tafrigh
DefaultGroupName=Tafrigh
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Tafrigh-{#AppVersion}-setup
SetupIconFile=tafrigh.ico
UninstallDisplayIcon={app}\Tafrigh.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\Tafrigh\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Tafrigh"; Filename: "{app}\Tafrigh.exe"
Name: "{autodesktop}\Tafrigh"; Filename: "{app}\Tafrigh.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Tafrigh.exe"; Description: "{cm:LaunchProgram,Tafrigh}"; Flags: nowait postinstall skipifsilent
