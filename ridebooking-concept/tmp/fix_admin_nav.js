const fs = require("fs");
const content = fs.readFileSync("src/App.tsx", "utf8");

const target =
  '      <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">';
const replacement = `      <div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">
        {/* Mobile Navigation Header */}
        <div className="md:hidden flex items-center justify-between mb-8 bg-white/80 backdrop-blur-md sticky top-0 z-50 -mx-6 px-6 py-3 border-b border-gray-100">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2.5 -ml-2.5 bg-gray-50 text-gray-950 rounded-xl hover:bg-gray-100 transition-all active:scale-95 shadow-sm border border-gray-200/50"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center shrink-0">
              {settings?.app_logo_url ? <img src={settings.app_logo_url} className="w-full h-full object-contain" /> : <Shield size={14} className="text-gray-950" />}
            </div>
            <span className="font-bold text-[13px] uppercase tracking-wider text-gray-950">{settings?.app_name || 'Admin'}</span>
          </div>

          <div className="w-9" /> {/* Spacer for balance */}
        </div>`;

const tabTarget = "              onClick={() => setActiveTab(id)}";
const tabReplacement =
  "              onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }}";

let newContent = content;

if (newContent.includes(target)) {
  newContent = newContent.replace(target, replacement);
} else {
  // Regex that ignores exact indentation
  const regex =
    /^\s*<div className="flex-1 p-6 md:p-8 overflow-y-auto w-full">/m;
  newContent = newContent.replace(
    regex,
    (match) => match + replacement.split("\n").slice(1).join("\n"),
  );
}

if (newContent.includes(tabTarget)) {
  newContent = newContent.replace(tabTarget, tabReplacement);
} else {
  // Try without exact indentation
  const tabRegex = /^\s*onClick=\{\(\) => setActiveTab\(id\)\}/m;
  newContent = newContent.replace(tabRegex, (match) =>
    match.replace(
      "setActiveTab(id)",
      "{ setActiveTab(id); setIsSidebarOpen(false); }",
    ),
  );
}

fs.writeFileSync("src/App.tsx", newContent);
console.log("Successfully updated App.tsx");
