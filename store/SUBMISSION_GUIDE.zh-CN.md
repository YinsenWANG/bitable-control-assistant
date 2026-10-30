# Chrome 商店提交指南 · v1.5.1

你已经注册了 Chrome 开发者，可直接从开发者后台开始。准备好本版材料包后，按下面顺序提交。**上传的是扩展 ZIP，不是整个材料包，也不是 GitHub 的源码 ZIP。**

## 1. 打开后台并上传

进入 [Chrome Web Store 开发者后台](https://chrome.google.com/webstore/devconsole)。

- 第一次提交这个扩展：点击「添加新项目 / Add new item」。
- 如果你已经为它创建过项目：打开原项目，在 Package 中上传新版本，保留同一个商店项目。

选择 `bitable-control-assistant-1.5.1-chrome.zip`。该 ZIP 根目录已有 manifest.json，版本为 1.5.1，不要再套一层文件夹或重新压缩整个材料包。

后台解析成功后，核对名称与版本。若提示版本必须增加，说明同一项目已上传相同或更高版本；不要只改 ZIP 文件名，需要生成递增版本的新包。

## 2. 填 Store listing

打开同包的 `01-商店逐项填写资料.md`，依次复制名称、简短说明、详细说明、网站与支持链接。默认语言选择简体中文，类别选择工作效率。

上传 `icon-128.png` 和截图。至少一张截图，建议提供已准备的五张：前两张展示真实设置页，后三张是已标明的功能布局示意。也可先上传前两张实际界面截图；对比示意图同样已用于 GitHub README。

所有截图均为 1280×800。小型宣传图 `宣传图-440x280.png` 为可选素材。无需制作视频即可提交。

## 3. 填 Privacy practices

仍从 `01-商店逐项填写资料.md` 复制以下内容：

1. Single purpose：单一用途。
2. Permission justification：storage 与飞书站点权限理由。
3. Remote code：选择“不使用远程代码”。
4. 数据使用：按照该文件的分类表披露本地处理的信息。
5. 填入隐私政策地址，并确认当前版本的数据使用承诺。

隐私政策使用仓库公开地址：
https://github.com/YinsenWANG/bitable-control-assistant/blob/main/PRIVACY.md

本版没有新增 GitHub 或所有网站的访问权限。电源刷新不读取那些页面的内容。即使数据不上传开发者，也不能把飞书记录、会议 URL 和评论的本地处理描述成“完全不处理用户数据”。

## 4. 填 Test instructions

打开 `02-审核测试说明.md`，可直接使用其中的英文步骤。

本项目已准备经发布者授权公开分享的「多维表格控制助手 · 审核演示 Review Demo」，仅含虚构数据。将 `02-审核测试说明.md` 中的专用入口和英文步骤填入后台 Test instructions。公开浏览可验证展示与导航；评论需要登录飞书并具备评论权限，也可创建个人副本测试。不要填内部业务表或私人账号凭据。

同包 `审核演示数据.csv` 只有虚构内容，可导入独立测试表。将“参考链接”列改成飞书的“超链接”类型，再创建第二个视图，用于检查视图切换。公开只读表无法验证评论编辑；若需验证完整功能，应给专用测试账号适当的演示表权限。

## 5. 设置 Distribution

根据希望的可见范围选择：

| 选项 | 适用情况 |
| --- | --- |
| Public / 公开 | 希望所有用户都能搜索、安装。与公开开源项目的发布方向一致。 |
| Unlisted / 不公开列出 | 仍可通过商店链接安装，但不进入公开搜索，适合先小范围分享。 |

选择希望提供服务的地区。此扩展本身免费且不含付费项目；请按后台实际要求完成可见性和地区字段。

## 6. 提交审核

确认 Package、Store listing、Privacy practices 和 Distribution 中没有未完成项，点击「Submit for review / 提交审核」。

确认弹窗中可选择审核通过后自动发布，或取消自动发布、待通过后手动发布。审核时间取决于平台，不能保证固定天数。后续关注后台状态及开发者邮箱；如需补充访问方式或说明，在原项目内回复、更新。

**提交前快速核对**

- 上传版本是 1.5.1，文件名以 `-chrome.zip` 结尾。
- 名称、描述、截图和隐私政策与本版行为一致。
- 测试入口可用，演示表含至少三条记录、两个视图和超链接字段。
- 电源和 Home 的组合键与 Chrome 实际设置一致。
- 发布材料中没有内部表格、账号凭据和私人记录。

## 上架后

保存商店链接，补到 GitHub README 与 Release。商店版和本地版的扩展 ID 可能不同：先导出本地设置，安装商店版后导入；Home 与电源的 Chrome 快捷键另行配置。避免同时启用两份扩展。

## 官方依据

- [上传、资料填写与提交审核](https://developer.chrome.com/docs/webstore/publish)
- [图标、截图和宣传图尺寸](https://developer.chrome.com/docs/webstore/images)
- [隐私实践页面](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [仅在本机处理的数据也必须披露](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [审核测试说明](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)
- [分发设置](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)

核对日期：2026-10-30。后台文字可能调整，以当前界面为准。
