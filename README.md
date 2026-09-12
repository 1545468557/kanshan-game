# 知乎——你是否问到了关键线索

桌面端优先、兼容手机的沉浸式网页推理游戏原型。已制作初始菜单、故事列表、案件简介、序幕、来源说明、第一幕《蓝血》的 3D 调查现场、五问解释面板、日记和案件边界内的人物问答原型。尚未接入远程大模型、知乎登录或线上部署。

主入口为 `dist/index.html`；旧演示保留在 `dist/legacy-demo.html`，不是正式关卡。

主菜单现在使用独立的故事档案馆背景 `dist/assets/story-archive-menu.png`。原来的公寓背景仅用于第一章简介与序幕，敲门交互移入序幕；关闭案件窗口后恢复主菜单背景。

档案馆背景通过内置 image_gen 生成。最终提示词：Premium stylized 3D cinematic nocturnal story archive/library. Spacious mysterious blue-lit hall with towering archival shelves and distant mezzanine. Central-right foreground elegant investigator reading table with closed case folders and one open book illuminated by a small warm desk lamp. Rainy arched window far right admits blue moonlight. Many stories awaiting investigation, thoughtful curiosity and discovery. Strong cinematic dimensionality. LEFT 45 percent dark uncluttered negative space for title/menu, table and shelves focal area RIGHT. Deep navy ink blue, cyan moonlight, restrained amber. Wide 16:9. No people, characters, text, writing, logos, UI, numbers, room doors, horror or abandoned apartment. One background image.

第一幕《蓝血》母题来源于知乎黑客松故事接口中的作品 `2025684191967294692`。官方片段包含急救培训、血色认知冲突与观察者元素；蓝色模拟液、旧公寓、五问结案、道具和 NPC 对话均为新增改编。公开使用前须按比赛规则确认改编权限。

首页背景使用内置 image_gen 生成，文件 `dist/assets/apartment-menu.png`。提示词：stylized 3D cinematic old Chinese apartment corridor, navy teal walls, closed wooden door on right at 72%, brass 402 plate, warm amber light underneath and overhead tungsten lamp, tiled floor, restrained box and plant, left 45% shadow negative space, 16:9, no characters/UI/text except 402. 该背景为静态美术，不代表已经实现可操作3D。

## 第一章 3D 房间试玩

当前入口为 `dist/room.html`，整合使用高真实感旧公寓场景和蓝血案件配置。历史第三人称原型保留在 `dist/room-gameplay.html`，仅作参考。

- 完全由立体网格搭建的旧公寓，包含窗户、木柜、书桌、沙发、靠窗旧木椅、褪色住户通知、门厅与冷暖灯光。
- 当前《蓝血》：WASD / 方向键移动，鼠标拖动转视角，滚轮调整远近；E 交互，R 回到刘看山。旧原型的 F 手电 / B 线索本快捷键不适用于当前页面。
- 手机使用左下摇杆移动，拖动场景转视角，点击交互按钮。
- 墙体 / 家具 / 人物碰撞、相机遇墙收近、四件物品调查、抽屉打开、三位人物的预设演示对话。
- 刘看山为参照官方素材制作的程序化近似模型，不是官方 3D 素材。熊、燕子、企鹅为符合角色身份的原创动物模型，不宣称是知乎其他官方 IP。
- 《蓝血》整合版的五题答案、日记、关键证据、辅助证据、干扰项和三名 NPC 边界集中在 `dist/blueblood-case.mjs`；自由问答暂为本地原型，结案评分按五个问题分别计算。
- 2026-09-11 真实感首轮：统一冷色窗光与暖色室内实灯，降低曝光；为门厅、门牌 402、书桌、木柜、纸箱和沙发增加圆角受光；补充门牌立体数字、窗帘褶皱、楼外建筑和与角色身份对应的生活物件。它们仍属于新增改编，不应当被误认作知乎原文事实。
- Three.js 固定为 0.180.0，浏览器直接加载 `dist/vendor/three/`，无需第三方 CDN 在线连接；MIT 许可证随引擎保留。
- 第一批真实外部资产：Poly Haven 的 Painted Wooden Cabinet（旧木柜）和 Wood Floor（PBR 地板贴图），均为 CC0 1.0；模型通过本地 `GLTFLoader` 加载。完整来源、用途与许可记录在 `dist/assets/ASSET-CREDITS.md`。
- `tests/room.test.mjs` 覆盖模型几何、动画数值、碰撞、全部交互点可达性与 DOM 引用。自动测试不代表 GPU 画面和手机真机已验收。

## 本地运行

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:4180/`。需要支持 WebGL 2 的浏览器。不要直接双击 HTML（浏览器会限制本地模块加载）。

有 Node.js 时运行逻辑检查：`node tests/room.test.mjs`。

## 蓝血第一幕调查现场（2026-09-12）

- 当前入口：`room.html`，场景使用 `room-art.mjs` / `room-art.css`，并载入 `blueblood-case.mjs` 案件配置与三个程序化 NPC 形象。
- 全新凹间、侧门洞与实体窗洞布局，7 件完整 glTF 家具/书籍模型，4 套 PBR 材质、HDR 环境反射、实体遮挡阴影和屏幕空间接触阴影。
- 默认操控刘看山第三人称行走，拖动环视、滚轮缩放；“观察镜头”中保留各个近景观察位置，按 R 返回主角原来的站位。触屏使用左侧摇杆移动，拖动场景环视，点击附近物件的交互按钮。
- 支持点击调查关键证据、辅助证据和干扰项，阅读五页日记，询问三个 NPC，编辑五题“我的解释”并提交结案。道具调查不会自动替玩家填写备忘录，也不会强制玩家调查某一件物品。
- 请从 HTTP 本地服务器打开；直接双击文件时会显示明确提示和本地试玩链接。
- `dist/assets/ROOM-ART-CREDITS.md` 记录来源、作者与许可。场景错误会提示失败素材，不用方块假装已加载成功。

### 基础观察交互（2026-09-11）

`room.html` 已加入第一层调查体验：点击主要物件会打开“现场观察”卡片。当前覆盖桌子、台灯、旧书、木柜、沙发、402 房门、墙上照片空位，以及厕所的洗漱台、镜子和马桶水箱。观察文字是本地固定内容，不调用大模型；玩家可以打开“调查备忘录”自行记录和推理，系统不会自动替玩家整理线索或下结论。

### 刘看山可操控主角（2026-09-12）

- 在现有写实房间中加入 `kanshan-player.mjs`，复用参考官方形象制作的程序化 3D 近似模型；没有替换房间或退回旧方块场景。
- WASD / 方向键移动、Shift 快走、拖动环视、滚轮调距离；走近物品或 NPC 后按 E，或直接点选附近物体。跟随镜头遇墙和家具自动收近。
- 墙体、家具、门框、三个 NPC 和卫生间设施有碰撞。抽屉前预留操作空间，不允许走进柜体。狭窄位置镜头过近时临时隐藏主角，移开后恢复。
- 调查卡片、人物对话、日记、备忘录、五问面板打开时停止移动；失焦清除按键，避免返回后继续走。关闭近景或按 R 回到原站位，物品开合状态不重置。
- 手机提供触屏摇杆和交互按钮；尚需手机真机验收。日记和五问仍可随时打开，不按调查数量解锁，不自动记录线索。
- 新测试 `node tests/apartment-navigation.test.mjs` 校验当前房间碰撞、门洞连通、家具和人物可达性；`tests/kanshan-player.test.mjs` 检查键盘/触屏输入、暂停、返回站位和失焦停步。全部测试可运行 `node --test tests/*.test.mjs`。
- NPC 仍为本地预设对话；本次主角接入不代表已经接通远程 AI，也未新增 OAuth 或部署。

### 水箱操作试玩（2026-09-11）

- 底部选择“卫生间”，再点“取下盖板”：镜头靠近水箱，陶瓷盖板先抬起、前移，再放到座圈上。“放回盖板”按相反顺序复原；动作中锁定重复输入。
- `cistern.mjs` 提供空心圆角水箱、独立盖板、水面、进水阀、浮子与排水组件；不是打开一张图片或翻转实心方块。也可以直接点击可见的水箱进入近景。
- 这仅验证操作，不增添藏物或剧情真相，不自动写入玩家备忘录。照片操作见下方，抽屉操作见再下方。
- `tests/cistern.test.mjs` 验证空腔可见、开合位置、重复点击锁、反复复原及减少动态效果模式；旧房间的碰撞测试不覆盖本次新操作。

### 照片操作试玩（2026-09-11）

- 选择底部“墙上照片”，或点击沙发上方的真实相框；选择“移开照片”，相框先抬起脱钩、离墙，再被拿到一旁。“放回照片”反向归位。可关闭卡片、切换视角后重新查看，状态不会重置。
- `wall-photo.mjs` 是独立的立体相框和动作模块；挂钉、颜色较浅的墙面留在原位置。没有自动线索栏、隐藏物或新剧情结论，也不会改写玩家备忘录。
- 走廊照片为 AI 生成的临时道具美术（`assets/wall-photo-v1.png`），不是知乎原文配图。生成提示词见素材记录；定稿剧情需另行核对来源。
- 运行 `node tests/wall-photo.test.mjs` 验证移开后的实际遮挡变化、连续八次归位、动作中重复输入、减少动态效果模式与模型数值。

### 抽屉操作试玩（2026-09-11）

- 选择底部“旧木柜”，或在全景中点击木柜；选择“打开抽屉”，抽屉沿木轨向外滑出，露出真实空腔；“推回抽屉”将其复原。动作中会锁定重复输入。
- 抽屉内部暂时保持空置，只验证真实操作和空间反馈，不自动生成藏物、线索或结论，也不会改写玩家备忘录。
- `drawer.mjs` 提供独立的抽屉前板、拉手、空腔和阻尼动作；运行 `node tests/drawer.test.mjs` 验证开合、输入锁、减少动态效果和几何数值。
