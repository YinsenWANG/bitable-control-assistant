# 审核测试说明 · v1.5.1

## 专用演示入口

本扩展没有独立登录系统。以下专用表格已获发布者许可公开分享，只有虚构记录，可用于审核与演示：

https://mcnnox2fhjfq.feishu.cn/base/Eh2HbZMybabRAwsU6pWcJTNQnHv?table=tblCHAydNa8jNlBe&view=vewhEFDVU2

无需访问任何内部业务表。公开浏览可验证展示与导航；评论需要登录飞书并具备评论权限，也可创建个人副本后验证。不要将私人账号凭据写入 GitHub 或公开说明。

随包的 `审核演示数据.csv` 可用于新建演示表。至少准备两个表格视图，并将“参考链接”列设为“超链接”。编辑和评论测试应仅在这个演示表中进行。

## English instructions for reviewers

Bitable Control Assistant is an independent extension for presenting Feishu Base in meetings. It has no paid features and no separate extension account. A Feishu account with access to a test Base is needed for the full workflow. A physical remote is optional: all controls can be tested using a keyboard.

Dedicated fictional Review Demo (publicly shared by its owner):
https://mcnnox2fhjfq.feishu.cn/base/Eh2HbZMybabRAwsU6pWcJTNQnHv?table=tblCHAydNa8jNlBe&view=vewhEFDVU2
It contains three fictional records, two grid views, long text and typed hyperlinks. No internal business data or extension login is needed. Commenting requires a signed-in Feishu account with comment permission; reviewers may create a personal copy to test commenting. Please do not enter sensitive data.

1. Open a test Base on a `*.feishu.cn` domain in Chrome. Use a grid view with at least three records, two views, a long-text field and a field whose type is URL / Hyperlink. Reload the page after installing the extension.
2. Open the extension settings. Configure the Chrome command “电源键：刷新当前标签页（所有网站）” as Control+Shift+8 and “Home 键：回到正在会议模式的多维表格” as Control+Shift+0. On macOS these mean the Control key, not Command. Shortcuts may need manual assignment if Chrome detects a conflict.
3. Return to the Base. Press Control+Shift+9, or use the extension popup to enter meeting mode. The window becomes fullscreen, the data-table sidebar collapses, and the document top bar is hidden. On macOS, disable Chrome's “Always Show Toolbar in Full Screen” if you want the browser toolbar hidden.
4. In the grid, use Up/Down to select records and Left/Right to switch views. Press Enter to open a record. In the record card, Up/Down move between fields or scroll long text; Left/Right move between records. Repeatedly move left and right: each destination should start with comments collapsed, including after deliberately opening or closing comments on the preceding record. Handle unsent drafts before switching. A redraw of the same record should preserve comments deliberately opened by the user.
5. Select a hyperlink-type field with Up/Down and press Enter. The link should open in a new tab. Ordinary prose links should not create additional navigation stops. Press Control+Shift+0 to return to the active meeting tab.
6. On a normal website such as GitHub, press Control+Shift+8. The current tab should reload even though the extension has no host permission or content script on that website. This command also works when meeting mode is off. It uses native browser reload behavior; handle unsaved content first.
7. Back in the Base, press PageDown (the default Menu binding) to open comments without entering input, then Enter to focus the comment editor. Alternatively, Control+Shift+C directly opens and focuses comments. Enter harmless text only in the dedicated test table. Arrow keys should move the caret; Backspace deletes text. Even when the editor is empty, repeated or held Backspace must keep input focus and leave comments and the record open. Press PageDown to collapse and reopen comments: the same draft must remain, and the reopened panel must not activate input until Enter is pressed. Escape explicitly leaves input. Only outside input, separate Backspace presses collapse comments and then close the card; holding must not cascade. Enter sends a comment while the comment editor is active; only test sending in the dedicated table. After the send is confirmed, the comment panel closes after the configured delay (one second by default). In settings, disable automatic closing or choose a delay from 0 to 60 seconds; starting a new draft or manually interacting with comments cancels an outstanding close. Optional dictation relay on macOS: leave a working Fn configuration in SayAll / Remote Mic and WeType unchanged, and enable “麦克风 · 语音接入评论” in the extension settings. While browsing an open record with comments collapsed, hold the remote microphone and speak, then release. After the input method finishes its composition, comments should open with the final transcript as a draft. This does not detect the Fn press itself. Existing drafts are appended to, failed transfers retain the source for recovery, and no comment is sent automatically. During ordinary field editing, input remains in that field. With relay enabled, directly typing while browsing a record also routes text into comments. Test this only in the dedicated demonstration table.
8. With native zoom switches off (the default), press Control+Shift+Equal ten times to increase zoom, then Control+Shift+Minus ten times to reduce it. Start at 100% with a 10% step: expect 200%, then 100%. Each press adds or removes the configured step; supported range is 50–250%. Optionally enable native zoom in settings and map Command+Equal / Command+Minus on macOS (Control on Windows): Chrome handles those keys and its own zoom levels, without using the configured step.
9. While meeting mode is active, reload the Base and wait for the grid to finish loading. Meeting mode should resume, including the hidden header and collapsed sidebar. Open a record with existing comments: its default comments panel should be collapsed; explicitly opening comments or entering a draft gives control back to the user. Then exit meeting mode with Control+Shift+9. The current Chrome window must leave fullscreen, and the header and original sidebar state must restore, including when other meeting tabs are still open. The bottom hint disappears after three seconds.
Also verify restoration in both directions: start once with the sidebar expanded and once collapsed. If you manually change it during a meeting, exit should restore the pre-meeting state.

10. In settings, use a Copy button, record a custom shortcut, and optionally test a “使用原生快捷键” switch. Home and Power are managed separately by Chrome and are not changed by extension configuration import/export.

The extension includes all executable code locally. It has no developer backend, analytics or microphone permission. The only host access is Feishu. Presentation illustrations use fictional data and are not screenshots of a customer's private Base.
