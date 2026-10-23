# v1.4.2 发布检查报告

日期：2026-10-23。基线：v1.4.1。检查对象：源码、运行包、真实飞书页面及商店提交材料。

## 结论与范围

本轮修复了会议刷新时侧栏漏收起、侧栏原始状态恢复不完整、浏览器前进/后退缓存恢复后会议登记丢失等问题；补强页面消息校验、网站存储受限时的容错和打包检查。89 项自动检查通过。真实 Mac Chrome 验证了刷新恢复、两种侧栏原始状态还原、顶部栏、详情聚焦、评论开关和空框双击返回。

现有快捷键、自定义缩放、配置迁移与权限范围不变。兼容目标是 Feishu `*.feishu.cn` 的表格视图和标准记录卡片；看板、甘特、日历、自定义卡片及其他浏览器尚未完整验证。这是项目发布检查，不是 Chrome Web Store 审核结论。

## 飞书官方资料与实现核对

| 资料 | 核对结果与处理 |
| --- | --- |
| [使用多维表格快捷键](https://www.feishu.cn/hc/zh-CN/articles/360049067880) | 通过官方网页读取快捷键表。Mac 的展开记录为 Command + E，侧边栏为 Command + 反斜杠；Windows 对应 Control。原生开关按平台展示。不把“切数据表”的键误称为“切视图”，也不编造评论聚焦的原生快捷键。 |
| [列出字段](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/list) | 官方区分文本与超链接：超链接为 type 15、ui_type Url。只为超链接字段建立单独链接焦点，普通文本网址保持一个字段停靠点。网页 CSS 类名来自实际页面适配，不是官方 API 的稳定承诺。 |
| [添加全文评论](https://open.feishu.cn/document/server-docs/docs/CommentAPI/create) | 该接口针对 doc/docx 的全文评论，不能当成多维表格记录评论接口。扩展通过原生记录评论控件操作，无额外 API 账号或凭据。 |
| [多维表格插件概述](https://open.feishu.cn/document/base-extensions/base-extension-introduction) | 官方插件围绕 Base 内部扩展能力。根据能力范围判断，Chrome 扩展仍适合跨标签页返回、刷新与窗口全屏需求；不把网页 DOM 操作说成官方插件接口。 |

同时检索了官方视图、记录详情自定义及权限资料，用于界定兼容边界；未将搜索摘要当作所有视图均已实测的证据。扩展沿用使用者的飞书权限，无法绕过只读、评论或访问限制。

## Skill 核对

读取了本机 `lark-base`（1.2.3）、`lark-openapi-explorer`（1.0.0）和 `lark-shared`（1.0.0），核对多维表格对象模型、官方 API 查找、身份及权限规则。本次没有申请 API 凭据或调用写记录接口。

当前可用技能没有专门的 Chrome 扩展审查 skill，Chrome 部分依据官方文档、代码与测试完成。上述飞书 API 技能不构成网页交互兼容性认证。

## Chrome 官方要求与代码检查

| 范围 | 结果 |
| --- | --- |
| [Commands](https://developer.chrome.com/docs/extensions/reference/api/commands) | 仅 Home、电源提供 Chrome 默认命令，未超出数量限制；Mac 使用 MacCtrl，区分 Control 与 Command。加减号不作为扩展命令，保留页面自定义缩放。备用 TV 命令使用触发时的标签页，避免异步焦点变化。 |
| [Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs) / [Windows](https://developer.chrome.com/docs/extensions/reference/api/windows) | Home 定位已登记会议；跨网站刷新仅使用标签页 ID，没有为 GitHub 添加全站或 tabs 权限。多个会议共享全屏状态，最后退出时才恢复扩展改变的窗口状态。 |
| [后台生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) / [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage) | 会议与窗口信息存于 storage.session，不仅依赖后台全局变量。网站 sessionStorage 只存会议开关和侧栏偏好，异常时降级内存。扩展重新加载与后台休眠是不同场景。 |
| [前进/后退缓存](https://web.dev/articles/bfcache) | pageshow.persisted 恢复时重新登记会议与全屏，保留现有页面与草稿。已模拟生命周期事件验证，未宣称真实飞书的每次导航都符合 BFCache 缓存资格。 |
| [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) / [安全建议](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure) | MAIN 世界画布桥仅用于已渲染记录定位；收到的数据视为页面控制输入，校验长度、类型、行数、绘制计数及坐标，选择前再检查画布范围。后台限制来源与动作；链接限 HTTP(S)，拒绝凭据 URL 和特殊协议。 |
| [CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) | 扩展页面只允许本地脚本，禁用对象、外部连接、base 与表单提交。代码随包提供，无 eval、远程脚本或开发者后端。打包检查拒绝内联脚本和事件处理属性。 |
| [图标](https://developer.chrome.com/docs/extensions/reference/manifest/icons) | 注册 16/32/48/128/256 PNG，检查签名与尺寸。保留原图；SVG 不是该图标字段支持的格式。增加分辨率不代表能恢复低清原图的细节。 |

## 本轮问题与修复证据

| 问题 | 修复与证据 |
| --- | --- |
| 刷新后顶部栏隐藏，侧栏仍展开 | 真实页面复现。飞书可能先渲染开关外壳，再挂载或重绘侧栏。等待实际侧栏存在，并短时间确认折叠稳定；用户操作后停止自动调整。增加晚挂载、早期开关、重绘及退出取消用例；最终真实页面刷新复测通过。 |
| 原侧栏折叠，会议中手动展开后无法还原 | 恢复原始展开与折叠两种状态，并跨刷新保留进入前偏好；真实页面验证两种方向。 |
| 后退缓存恢复时 UI 与后台登记不一致 | 处理 pageshow.persisted；测试确认启用 → pagehide 释放 → pageshow 重新启用。暂停页面恢复不会自动全屏。 |
| 网站存储限制导致会议开关报错 | 内存回退覆盖读取不可用、写入失败、删除旧偏好，会议仍可进入/退出；受限时不承诺跨刷新保留。 |
| 异常或伪造绘制回复影响定位 | 校验结构与数量，移除未使用字段，拒绝无效及越界坐标，自动检查通过。 |
| 备用 TV 命令因焦点变化操作其他标签 | 使用 Chrome 提供的触发标签页，测试覆盖异步焦点变化。 |

## 回归与真实页面验证

89 项自动检查覆盖消息范围、Home / 电源、全屏所有权、后台重启、草稿保护、字段与链接导航、输入法事件、光标移动、空框双击返回、快速缩放队列、原生开关、配置迁移、复制和提示栏计时。资源检查验证 manifest、20 个运行文件、语法、图标与引用。

真实 Mac Chrome 本轮确认：

- TV 进入会议：侧栏折叠，文档顶部栏高度 64 → 0。
- 会议中刷新：加载完成后恢复会议、折叠侧栏、隐藏顶部栏；退出恢复侧栏展开和顶部栏高度 64。
- 原侧栏折叠 → 开会 → 手动展开 → 退出：还原折叠，会议过程中不会持续阻止手动展开。
- 退出后提示栏自动隐藏，精确三秒边界另由自动计时测试确认。
- 原生 Enter 打开详情，上下键可聚焦第一、第二字段并返回。
- 已配置的 Command + 反斜杠打开并聚焦空评论框，再按收起。单次 Backspace 保留输入，快速双击仅退出输入，随后可以逐层返回。
- 未向业务表发送评论或修改记录；结束后恢复正常布局，扩展来源的错误日志检查为空。

普通键的浏览器自动化接口部分调用超时，改用原生应用按键完成验证；没有把工具超时算成扩展通过。Home 跨标签返回、电源刷新 GitHub及映射软件连按问题的实体设备确认沿用 [v1.4.1 验收](TESTING-v1.4.1.md)，本版未改变缩放方案。

依赖审计为 0 个已知漏洞；运行时没有 npm 依赖，jsdom 仅用于测试。这只代表审计当时数据库覆盖的已知问题。

## 发布与商店材料

- 运行 ZIP 根目录为 manifest.json，23 个文件；排除测试、示例、商店插图、内部链接和私人数据。验证重复构建一致并保存 SHA-256。
- README、更新记录、隐私政策、审核步骤与材料包统一版本，历史验收记录保留。
- [商店图片要求](https://developer.chrome.com/docs/webstore/images)：128 PNG 图标、五张 1280×800 图片及可选 440×280 宣传图。两张为真实设置 HTML 的本地预览；三张为标注虚构数据的布局示意，不冒充客户表格截图。
- 按[隐私填写要求](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[本地数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)及[用户数据政策](https://developer.chrome.com/docs/webstore/program-policies/policies)披露本机处理和 Limited Use 承诺，避免把“不上传”写成“不处理数据”。
- 依据[发布流程](https://developer.chrome.com/docs/webstore/publish)及[审核测试说明](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)提供提交材料。发布者仍需在后台私有测试说明中提供可用演示表访问方式；公开包只含虚构 CSV，没有内部业务表或凭据。

GitHub Release 不代表已提交或通过 Chrome Web Store 审核。请按[提交指南](../store/SUBMISSION_GUIDE.zh-CN.md)上传运行 ZIP。
