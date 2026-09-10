# 知乎——你是否问到了关键线索

桌面端优先、兼容手机的沉浸式网页推理游戏原型。本轮完成初始菜单、故事列表、案件简介、序幕、来源说明与设备本地设置。尚未接入 AI、3D 移动或知乎登录。

主入口为 `dist/index.html`；旧演示保留在 `dist/legacy-demo.html`，不是正式关卡。

第一关候选来源：青山依旧在在 https://www.zhihu.com/question/62901581/answer/2079913121867682184 的回答。公开使用前须确认改编权限。序幕文字为新增改编。

首页背景使用内置 image_gen 生成，文件 `dist/assets/apartment-menu.png`。提示词：stylized 3D cinematic old Chinese apartment corridor, navy teal walls, closed wooden door on right at 72%, brass 402 plate, warm amber light underneath and overhead tungsten lamp, tiled floor, restrained box and plant, left 45% shadow negative space, 16:9, no characters/UI/text except 402. 该背景为静态美术，不代表已经实现可操作3D。

本地运行：

```bash
python3 -m http.server 4173 --directory dist
```
