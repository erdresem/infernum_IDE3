from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
ext = root / 'extension-source'
pkg_path = ext / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['displayName'] = 'Infernum AI'
pkg['description'] = 'Infernum AI coding agent built into Infernum IDE (Code-OSS fork).'
pkg['version'] = '0.4.0'
pkg['categories'] = ['AI', 'Programming Languages', 'Other']
pkg['keywords'] = sorted(set(pkg.get('keywords', []) + ['infernum-ide', 'code-oss', 'cursor-style', 'creative-ai']))
# The AI panel lives in the secondary/right sidebar, like a coding companion.
pkg['contributes']['viewsContainers'] = {
    'secondarySidebar': [{
        'id': 'infernum',
        'title': 'Infernum AI',
        'icon': 'media/activity.svg'
    }]
}
pkg['contributes']['views'] = {
    'infernum': [{
        'id': 'infernum.sidebar',
        'name': 'Infernum AI',
        'type': 'webview'
    }]
}
# Add real Workbench defaults so the whole application opens as Infernum, not a stock VS Code profile.
pkg['contributes']['configurationDefaults'] = {
    'workbench.colorTheme': 'Infernum Midnight',
    'workbench.iconTheme': 'infernum-file-icons',
    'workbench.sideBar.location': 'left',
    'workbench.panel.defaultLocation': 'bottom',
    'workbench.secondarySideBar.defaultVisibility': True,
    'workbench.startupEditor': 'none',
    'window.commandCenter': True,
    'editor.minimap.enabled': False,
    'editor.fontLigatures': True,
    'editor.smoothScrolling': True,
    'editor.cursorSmoothCaretAnimation': 'on',
    'editor.bracketPairColorization.enabled': True,
    'explorer.compactFolders': False,
    'workbench.tree.indent': 14,
    'workbench.list.smoothScrolling': True,
    'workbench.editor.tabSizing': 'shrink'
}
themes = pkg['contributes'].setdefault('themes', [])
themes[:] = [theme for theme in themes if theme.get('path') != './themes/infernum-color-theme.json']
themes.append({
    'label': 'Infernum Midnight',
    'uiTheme': 'vs-dark',
    'path': './themes/infernum-color-theme.json'
})
icon_themes = pkg['contributes'].setdefault('iconThemes', [])
icon_themes[:] = [theme for theme in icon_themes if theme.get('path') != './icons/infernum-file-icon-theme.json']
icon_themes.append({
    'id': 'infernum-file-icons',
    'label': 'Infernum File Icons',
    'path': './icons/infernum-file-icon-theme.json'
})
# Rename display strings in commands/settings without changing public command IDs for compatibility.
pkg['contributes']['configuration']['title'] = 'Infernum IDE'
for c in pkg['contributes'].get('commands', []):
    c['title'] = c['title'].replace('Infernum Code', 'Infernum')
# Keep existing Activity Bar commands/activation identifiers stable; only the view container moved to secondary sidebar.
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Expand the single-mode agent engine with a creative mode; it still uses the same Primary Model.
types_file = ext / 'src/core/types.ts'
s = types_file.read_text(encoding='utf-8')
s = s.replace("export type ChatMode = 'chat' | 'agent' | 'code' | 'debug' | 'explain' | 'plan' | 'review';",
              "export type ChatMode = 'chat' | 'agent' | 'code' | 'debug' | 'explain' | 'plan' | 'review' | 'creative';")
types_file.write_text(s, encoding='utf-8')
engine_file = ext / 'src/agents/engine.ts'
s = engine_file.read_text(encoding='utf-8')
s = s.replace("  review: 'Review the code. Prioritize concrete defects and security risks with file and line references. Do not modify files unless explicitly requested.'\n};",
              "  review: 'Review the code. Prioritize concrete defects and security risks with file and line references. Do not modify files unless explicitly requested.',\n  creative: 'Act as a creative partner for game design, worldbuilding, narrative, characters, product concepts, UX writing and ideation. Explore original options, keep ideas coherent, and turn the chosen direction into a practical brief or implementation-ready specification. Do not modify workspace files unless asked.'\n};")
engine_file.write_text(s, encoding='utf-8')

view_file = ext / 'src/ui/view-provider.ts'
s = view_file.read_text(encoding='utf-8')
s = s.replace("      case 'openHub': this.post({ type: 'tab', tab: 'hub' }); break;",
              "      case 'openHub': this.post({ type: 'tab', tab: 'hub' }); break;\n      case 'focusEditor': await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup'); break;")
s = s.replace("['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review'].includes(message.mode)",
              "['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review', 'creative'].includes(message.mode)")
s = s.replace("['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review'].includes(mode)",
              "['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review', 'creative'].includes(mode)")
s = s.replace("<title>Infernum Code</title>", "<title>Infernum AI</title>")
view_file.write_text(s, encoding='utf-8')

# Rework the top-level tabs: Editor focuses the actual Code-OSS editor; the other three modes use Infernum's single model.
app_file = ext / 'webview/app.js'
s = app_file.read_text(encoding='utf-8')
s = s.replace("const modeLabels = { chat: 'Chat', agent: 'Agent Mode', code: 'Code', debug: 'Debug', explain: 'Explain', plan: 'Plan', review: 'Review' };",
              "const modeLabels = { chat: 'Chat', agent: 'Agent', code: 'AI Code', debug: 'Debug', explain: 'Explain', plan: 'Plan', review: 'Review', creative: 'Creative AI' };")
s = s.replace("workspace: 'Workspace', tab: 'chat', mode: 'chat', messages: []", "workspace: 'Workspace', tab: 'chat', mode: 'agent', messages: []")
s = s.replace('<div class="brand-copy"><strong>INFERNUM CODE</strong><small>AI agent workspace</small></div>',
              '<div class="brand-copy"><strong>INFERNUM</strong><small>AI-native development</small></div>')
old = '''        <nav class="tabs" aria-label="Infernum sections">
          <button class="tab ${state.tab === 'chat' ? 'active' : ''}" data-tab="chat">⌘ Chat</button>
          <button class="tab ${state.tab === 'library' ? 'active' : ''}" data-tab="library">◈ Agent Library</button>
          <button class="tab ${state.tab === 'hub' ? 'active' : ''}" data-tab="hub">◎ Agent Hub${state.providers.length ? ` · ${state.providers.length}` : ''}</button>
        </nav>'''
new = '''        <nav class="tabs" aria-label="Infernum modes">
          <button class="tab ${state.mode === 'agent' && state.tab === 'chat' ? 'active' : ''}" data-mode="agent" title="Agent">✦ <span>Agent</span></button>
          <button class="tab" data-mode="editor" title="Focus the native Code-OSS editor">⌘ <span>Editor</span></button>
          <button class="tab ${state.mode === 'code' && state.tab === 'chat' ? 'active' : ''}" data-mode="code" title="AI Code">{ } <span>AI Code</span></button>
          <button class="tab ${state.mode === 'creative' && state.tab === 'chat' ? 'active' : ''}" data-mode="creative" title="Creative AI">✧ <span>Creative</span></button>
        </nav>
        <nav class="subtabs" aria-label="Infernum tools">
          <button class="subtab ${state.tab === 'library' ? 'active' : ''}" data-tab="library">Profiles</button>
          <button class="subtab ${state.tab === 'hub' ? 'active' : ''}" data-tab="hub">Models${state.providers.length ? ` · ${state.providers.length}` : ''}</button>
          <span class="subtab-spacer"></span>
          <button class="subtab" data-action="settings" title="Infernum appearance settings">Settings</button>
        </nav>'''
if old not in s:
    raise SystemExit('Top tabs block not found in app.js')
s = s.replace(old, new)
s = s.replace("root.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));",
'''root.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));
    root.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => {
      const mode = el.dataset.mode;
      if (mode === 'editor') { post({ type: 'focusEditor' }); return; }
      state.tab = 'chat'; state.mode = mode; render();
    }));''')
s = s.replace("case 'settings': state.modal = { type: 'settings' }; render(); break;",
              "case 'settings': state.modal = { type: 'settings' }; render(); break;")
s = s.replace("<h2>Welcome to Infernum</h2>", "<h2>Welcome to Infernum</h2>")
app_file.write_text(s, encoding='utf-8')

# Tighten extension's secondary-sidebar layout for Cursor-like narrow AI panel.
css_file = ext / 'webview/style.css'
s = css_file.read_text(encoding='utf-8')
s = s.replace(".tabs { padding: 8px 10px 0; display:flex; gap:5px; border-bottom:1px solid var(--line); background:var(--panel); }\n.tab { flex:1; min-width:0; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--muted); padding:8px 4px 9px; font-size:11px; }\n.tab.active { color:var(--text); border-bottom-color:var(--infernum-accent); }",
'''.tabs { padding: 7px 8px 0; display:flex; gap:2px; border-bottom:1px solid var(--line); background:var(--panel); }
.tab { flex:1; min-width:0; border:0; border-bottom:2px solid transparent; border-radius:7px 7px 0 0; background:transparent; color:var(--muted); padding:8px 2px 9px; font-size:10px; white-space:nowrap; }
.tab span { font-size:10px; }
.tab:hover { color:var(--text); background:color-mix(in srgb,var(--vscode-foreground) 5%,transparent); }
.tab.active { color:var(--text); border-bottom-color:var(--infernum-accent); background:color-mix(in srgb,var(--infernum-accent) 7%,transparent); }
.subtabs { min-height:32px; display:flex; align-items:center; gap:4px; padding:3px 10px; border-bottom:1px solid var(--line); background:var(--panel); }
.subtab { border:0; background:transparent; color:var(--muted); border-radius:6px; padding:5px 7px; font-size:9px; }
.subtab:hover,.subtab.active { color:var(--text); background:var(--surface); }
.subtab-spacer { flex:1; }''')
css_file.write_text(s, encoding='utf-8')

# Color theme: understated graphite palette with lavender accent and restrained syntax contrast.
themes = ext / 'themes'; themes.mkdir(exist_ok=True)
theme = {
  "name": "Infernum Midnight",
  "type": "dark",
  "colors": {
    "focusBorder": "#8b7ae8",
    "foreground": "#d7d8df",
    "descriptionForeground": "#858797",
    "disabledForeground": "#666977",
    "widget.shadow": "#00000066",
    "selection.background": "#6e5bd64d",
    "textLink.foreground": "#b6a7ff",
    "textLink.activeForeground": "#d0c6ff",
    "editor.background": "#111216",
    "editor.foreground": "#d7d8df",
    "editorLineNumber.foreground": "#555866",
    "editorLineNumber.activeForeground": "#c2c3d0",
    "editorCursor.foreground": "#c1aaff",
    "editor.selectionBackground": "#6656a84d",
    "editor.inactiveSelectionBackground": "#ffffff12",
    "editor.lineHighlightBackground": "#ffffff06",
    "editorIndentGuide.background1": "#ffffff12",
    "editorIndentGuide.activeBackground1": "#a78bfa55",
    "editorWhitespace.foreground": "#ffffff16",
    "editorBracketMatch.background": "#8b7ae822",
    "editorBracketMatch.border": "#a78bfa88",
    "editorGutter.background": "#111216",
    "editorWidget.background": "#1a1b22",
    "editorWidget.border": "#30313d",
    "editorHoverWidget.background": "#1a1b22",
    "editorHoverWidget.border": "#343542",
    "editorSuggestWidget.background": "#1a1b22",
    "editorSuggestWidget.border": "#343542",
    "editorSuggestWidget.selectedBackground": "#6d5bb433",
    "sideBar.background": "#17181e",
    "sideBar.foreground": "#c5c6d0",
    "sideBar.border": "#292a34",
    "sideBarTitle.foreground": "#e1e1e8",
    "sideBarSectionHeader.background": "#ffffff05",
    "sideBarSectionHeader.foreground": "#a8a9b6",
    "activityBar.background": "#14151a",
    "activityBar.foreground": "#d5d3e5",
    "activityBar.inactiveForeground": "#777987",
    "activityBar.border": "#282933",
    "activityBar.activeBorder": "#a78bfa",
    "activityBarBadge.background": "#8774df",
    "activityBarBadge.foreground": "#ffffff",
    "titleBar.activeBackground": "#17181e",
    "titleBar.activeForeground": "#d7d8df",
    "titleBar.inactiveBackground": "#17181e",
    "titleBar.inactiveForeground": "#858797",
    "titleBar.border": "#292a34",
    "statusBar.background": "#17181e",
    "statusBar.foreground": "#aeb0bc",
    "statusBar.border": "#292a34",
    "statusBarItem.hoverBackground": "#ffffff12",
    "panel.background": "#14151a",
    "panel.border": "#292a34",
    "panelTitle.activeForeground": "#dedee7",
    "panelTitle.inactiveForeground": "#858797",
    "panelTitle.activeBorder": "#a78bfa",
    "terminal.background": "#111216",
    "terminal.foreground": "#d7d8df",
    "terminal.ansiBlack": "#20212a",
    "terminal.ansiRed": "#e87986",
    "terminal.ansiGreen": "#8ccea6",
    "terminal.ansiYellow": "#e8c98a",
    "terminal.ansiBlue": "#91a9ed",
    "terminal.ansiMagenta": "#bb9bea",
    "terminal.ansiCyan": "#83cbd3",
    "terminal.ansiWhite": "#d7d8df",
    "input.background": "#20212a",
    "input.foreground": "#e0e0e7",
    "input.border": "#363744",
    "input.placeholderForeground": "#777987",
    "inputOption.activeBorder": "#a78bfa",
    "button.background": "#7865cc",
    "button.foreground": "#ffffff",
    "button.hoverBackground": "#8875dc",
    "list.activeSelectionBackground": "#6d5bb433",
    "list.activeSelectionForeground": "#eceaf6",
    "list.hoverBackground": "#ffffff0b",
    "list.focusBackground": "#6d5bb433",
    "list.inactiveSelectionBackground": "#6d5bb422",
    "dropdown.background": "#20212a",
    "dropdown.border": "#363744",
    "scrollbarSlider.background": "#ffffff20",
    "scrollbarSlider.hoverBackground": "#ffffff35",
    "scrollbarSlider.activeBackground": "#ffffff48",
    "notificationCenterHeader.background": "#1a1b22",
    "notifications.background": "#1a1b22",
    "notifications.border": "#363744",
    "quickInput.background": "#1a1b22",
    "quickInput.foreground": "#d7d8df",
    "quickInputList.focusBackground": "#6d5bb433",
    "tab.activeBackground": "#111216",
    "tab.activeForeground": "#e1e1e8",
    "tab.inactiveBackground": "#17181e",
    "tab.inactiveForeground": "#8c8e9b",
    "tab.border": "#292a34",
    "tab.activeBorderTop": "#a78bfa",
    "editorGroup.border": "#292a34",
    "editorGroupHeader.tabsBackground": "#17181e",
    "editorGroupHeader.noTabsBackground": "#111216",
    "breadcrumb.foreground": "#858797",
    "breadcrumb.focusForeground": "#d7d8df",
    "gitDecoration.addedResourceForeground": "#8ccea6",
    "gitDecoration.modifiedResourceForeground": "#e8c98a",
    "gitDecoration.deletedResourceForeground": "#e87986",
    "gitDecoration.untrackedResourceForeground": "#83cbd3",
    "minimap.background": "#111216"
  },
  "tokenColors": [
    {"scope": ["comment", "punctuation.definition.comment"], "settings": {"foreground": "#747987", "fontStyle": "italic"}},
    {"scope": ["keyword", "storage.type", "storage.modifier"], "settings": {"foreground": "#c5a6f5"}},
    {"scope": ["string", "punctuation.definition.string"], "settings": {"foreground": "#a8c995"}},
    {"scope": ["constant.numeric", "constant.language"], "settings": {"foreground": "#e5b98c"}},
    {"scope": ["entity.name.function", "support.function"], "settings": {"foreground": "#8fb9ed"}},
    {"scope": ["entity.name.type", "entity.name.class", "support.type"], "settings": {"foreground": "#e5c28a"}},
    {"scope": ["variable", "identifier"], "settings": {"foreground": "#d7d8df"}},
    {"scope": ["entity.name.tag"], "settings": {"foreground": "#e58d9b"}},
    {"scope": ["punctuation", "meta.brace"], "settings": {"foreground": "#aeb0bc"}},
    {"scope": ["invalid"], "settings": {"foreground": "#ffffff", "background": "#a83246"}}
  ]
}
theme_file = themes / 'infernum-color-theme.json'
theme_file.write_text(json.dumps(theme, indent=2) + '\n', encoding='utf-8')

icons = ext / 'icons'; icons.mkdir(exist_ok=True)
icon_theme = {
 "iconDefinitions": {
  "_file": {"iconPath": "../media/icons/file.svg"},
  "_folder": {"iconPath": "../media/icons/folder.svg"},
  "_agent": {"iconPath": "../media/icons/agent.svg"},
  "_creative": {"iconPath": "../media/icons/creative.svg"},
  "_debug": {"iconPath": "../media/icons/debug.svg"},
  "_editor": {"iconPath": "../media/icons/editor.svg"},
  "_git": {"iconPath": "../media/icons/git.svg"},
  "_terminal": {"iconPath": "../media/icons/terminal.svg"},
  "_settings": {"iconPath": "../media/icons/settings.svg"},
  "_search": {"iconPath": "../media/icons/search.svg"},
  "_extensions": {"iconPath": "../media/icons/extensions.svg"},
  "_play": {"iconPath": "../media/icons/play.svg"},
  "_sparkle": {"iconPath": "../media/icons/sparkle.svg"}
 },
 "file": "_file",
 "folder": "_folder",
 "folderExpanded": "_folder",
 "rootFolder": "_folder",
 "rootFolderExpanded": "_folder",
 "fileExtensions": {
  "ts": "_editor", "tsx": "_editor", "js": "_editor", "jsx": "_editor", "mjs": "_editor", "cjs": "_editor",
  "py": "_editor", "rs": "_editor", "go": "_editor", "java": "_editor", "cs": "_editor", "cpp": "_editor", "c": "_editor",
  "json": "_settings", "jsonc": "_settings", "toml": "_settings", "yaml": "_settings", "yml": "_settings",
  "md": "_file", "mdx": "_file", "html": "_file", "css": "_file", "scss": "_file", "svg": "_file",
  "png": "_file", "jpg": "_file", "jpeg": "_file", "webp": "_file", "ico": "_file", "lock": "_settings", "log": "_terminal"
 },
 "fileNames": {"Dockerfile": "_terminal", "Makefile": "_terminal", ".gitignore": "_git", ".editorconfig": "_settings", "package.json": "_settings", "tsconfig.json": "_settings"},
 "folderNames": {".git": "_git", ".vscode": "_settings", "src": "_folder", "tests": "_debug", "test": "_debug", "assets": "_file", "docs": "_file"},
 "folderNamesExpanded": {".git": "_git", ".vscode": "_settings", "src": "_folder", "tests": "_debug", "test": "_debug"}
}
(icons / 'infernum-file-icon-theme.json').write_text(json.dumps(icon_theme, indent=2) + '\n', encoding='utf-8')

# Manifest title and docs.
readme = ext / 'README.md'
s = readme.read_text(encoding='utf-8')
s = s.replace('# Infernum Code', '# Infernum AI')
s = s.replace('A single-model AI coding workspace for Visual Studio Code.', 'The built-in AI workspace for Infernum IDE, a Code-OSS fork.')
s = s.replace('Infernum Code', 'Infernum AI')
s = s.replace('VS Code', 'Infernum IDE')
s = s.replace('Visual Studio Code', 'Infernum IDE')
readme.write_text(s, encoding='utf-8')

html_file = ext / 'webview/index.html'
s = html_file.read_text(encoding='utf-8').replace('<title>Infernum Code</title>', '<title>Infernum AI</title>')
html_file.write_text(s, encoding='utf-8')

print('Prepared Infernum AI extension: theme + icons + four modes + right sidebar.')
