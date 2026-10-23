# 审核测试说明 · v1.3.0

## 发布者提交前补充

此扩展没有自己的登录系统，但需要可访问的飞书多维表格。下面步骤假定测试者已经有演示表访问权限。请在 Chrome Web Store 的私有 Test instructions 字段补充专用演示表入口，以及确有必要的专用测试账号使用方法。不要把凭据保存到本文件或公开仓库。

随包的 `审核演示数据.csv` 可用于新建演示表。至少准备两个表格视图，并将“参考链接”列设为“超链接”。编辑和评论测试应仅在这个演示表中进行。

## English instructions for reviewers

Feishu Meeting Remote is an independent extension for presenting Feishu Base in meetings. It has no paid features and no separate extension account. A Feishu account with access to a test Base is needed for the full workflow. A physical remote is optional: all controls can be tested using a keyboard.

1. Open a test Base on a `*.feishu.cn` domain in Chrome. Use a grid view with at least three records, two views, a long-text field and a field whose type is URL / Hyperlink. Reload the page after installing the extension.
2. Open the extension settings. Configure the Chrome command “电源键：刷新当前标签页（所有网站）” as Control+Shift+8 and “Home 键：回到正在会议模式的多维表格” as Control+Shift+0. On macOS these mean the Control key, not Command. Shortcuts may need manual assignment if Chrome detects a conflict.
3. Return to the Base. Press Control+Shift+9, or use the extension popup to enter meeting mode. The window becomes fullscreen, the data-table sidebar collapses, and the document top bar is hidden. On macOS, disable Chrome's “Always Show Toolbar in Full Screen” if you want the browser toolbar hidden.
4. In the grid, use Up/Down to select records and Left/Right to switch views. Press Enter to open a record. In the record card, Up/Down move between fields or scroll long text; Left/Right move between records.
5. Select a hyperlink-type field with Up/Down and press Enter. The link should open in a new tab. Ordinary prose links should not create additional navigation stops. Press Control+Shift+0 to return to the active meeting tab.
6. On a normal website such as GitHub, press Control+Shift+8. The current tab should reload even though the extension has no host permission or content script on that website. This command also works when meeting mode is off. It uses native browser reload behavior; handle unsaved content first.
7. Back in the Base, press PageDown (the default Menu binding) to open comments and focus the editor. Enter harmless text only in the dedicated test table. Arrow keys should move the caret; Backspace deletes text. Press PageDown to collapse and reopen comments, retaining the draft. With an empty editor, separate Backspace presses leave input, collapse comments, then close the card. Holding Backspace must not cascade through these levels. Enter sends a comment when the comment editor is ready; only test sending in the dedicated table.
8. Press Control+Shift+Equal several times to increase zoom, then Control+Shift+Minus to reduce it. Each press adds or removes the configured step; supported range is 50–250%.
9. Exit meeting mode with Control+Shift+9. The header, original sidebar state and extension-owned window state should restore. The bottom hint disappears after three seconds.
10. In settings, use a Copy button, record a custom shortcut, and optionally test a “使用原生快捷键” switch. Home and Power are managed separately by Chrome and are not changed by extension configuration import/export.

The extension includes all executable code locally. It has no developer backend, analytics or microphone permission. The only host access is Feishu. Presentation illustrations use fictional data and are not screenshots of a customer's private Base.
