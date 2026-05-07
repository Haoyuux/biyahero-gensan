$path = "src/App.tsx"
$content = [System.IO.File]::ReadAllText($path)

# Add auto-close to sidebar tabs
$content = $content.Replace("onClick={() => setActiveTab(id)}", "onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }}")

# Add mobile navigation header
$target = '      <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">'
$header = '      <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">' + "`n" + 
          '        {/* Mobile Navigation Header */}' + "`n" + 
          '        <div className="md:hidden flex items-center justify-between mb-8 bg-white/80 backdrop-blur-md sticky top-0 z-50 -mx-6 px-6 py-3 border-b border-gray-100">' + "`n" + 
          '          <button' + "`n" + 
          '            onClick={() => setIsSidebarOpen(true)}' + "`n" + 
          '            className="p-2.5 -ml-2.5 bg-gray-50 text-gray-950 rounded-xl hover:bg-gray-100 transition-all active:scale-95 shadow-sm border border-gray-200/50"' + "`n" + 
          '          >' + "`n" + 
          '            <Menu size={20} />' + "`n" + 
          '          </button>' + "`n" + 
          '' + "`n" + 
          '          <div className="flex items-center gap-2">' + "`n" + 
          '            <div className="w-7 h-7 flex items-center justify-center shrink-0">' + "`n" + 
          '              {settings?.app_logo_url ? <img src={settings.app_logo_url} className="w-full h-full object-contain" /> : <Shield size={14} className="text-gray-950" />}' + "`n" + 
          '            </div>' + "`n" + 
          '            <span className="font-bold text-[13px] uppercase tracking-wider text-gray-950">{settings?.app_name || ''Admin''}</span>' + "`n" + 
          '          </div>' + "`n" + 
          '' + "`n" + 
          '          <div className="w-9" />' + "`n" + 
          '        </div>'

# Using a regex-based replacement to be more robust against spacing
$content = [regex]::Replace($content, '(?m)^\s*<div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">', $header)

[System.IO.File]::WriteAllText($path, $content)
Write-Output "Successfully updated App.tsx"
