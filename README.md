# 知乎——你是否问到了关键线索

桌面端优先、兼容手机的沉浸式网页推理游戏原型。已制作初始菜单、故事列表、案件简介、序幕、来源说明、第一幕《蓝血》的 3D 调查现场、五问解释面板、日记，以及由大模型即兴扮演的三名当事人问答。已接入知乎 OAuth 登录：**公网版会先请你登记一下**（门上留了「先以访客身份进入」的出口；本地地址不设门，便于开发试玩）；公网部署见下方「本地运行」。

主入口为 `public/index.html`；旧演示保留在 `public/legacy-demo.html`，不是正式关卡。

主菜单现在使用独立的故事档案馆背景 `public/assets/story-archive-menu.jpg`。原来的公寓背景仅用于第一章简介与序幕，敲门交互移入序幕；关闭案件窗口后恢复主菜单背景。

档案馆背景通过内置 image_gen 生成。最终提示词：Premium stylized 3D cinematic nocturnal story archive/library. Spacious mysterious blue-lit hall with towering archival shelves and distant mezzanine. Central-right foreground elegant investigator reading table with closed case folders and one open book illuminated by a small warm desk lamp. Rainy arched window far right admits blue moonlight. Many stories awaiting investigation, thoughtful curiosity and discovery. Strong cinematic dimensionality. LEFT 45 percent dark uncluttered negative space for title/menu, table and shelves focal area RIGHT. Deep navy ink blue, cyan moonlight, restrained amber. Wide 16:9. No people, characters, text, writing, logos, UI, numbers, room doors, horror or abandoned apartment. One background image.

第一幕《蓝血》母题来源于知乎黑客松故事接口中的作品 `2025684191967294692`。官方片段包含急救培训、血色认知冲突与观察者元素；蓝色模拟液、旧公寓、五问结案、道具和 NPC 对话均为新增改编。公开使用前须按比赛规则确认改编权限。

首页背景使用内置 image_gen 生成，文件 `public/assets/apartment-menu.jpg`。提示词：stylized 3D cinematic old Chinese apartment corridor, navy teal walls, closed wooden door on right at 72%, brass 402 plate, warm amber light underneath and overhead tungsten lamp, tiled floor, restrained box and plant, left 45% shadow negative space, 16:9, no characters/UI/text except 402. 该背景为静态美术，不代表已经实现可操作3D。

## 第一章 3D 房间试玩

游戏首页是 `public/index.html` —— **根路径 `/` 打开的就是它**，线上链接和本地双击 `开始游戏.command` 都落在这一页。从首页的「选择故事 → 第一章 蓝血 → 进入调查现场」进入第一幕。

第一幕本体是 `public/room.html`，整合使用微缩模型风格的旧公寓场景和蓝血案件配置。也可以直接访问 `/room.html` 跳过开场菜单。历史第三人称原型保留在 `public/room-gameplay.html`，仅作参考。

- 完全由立体网格搭建的旧公寓，包含窗户、木柜、书桌、沙发、靠窗旧木椅、褪色住户通知、门厅与冷暖灯光。
- 当前《蓝血》：WASD / 方向键移动，鼠标拖动转视角，滚轮调整远近；E 交互，R 回到刘看山。旧原型的 F 手电 / B 线索本快捷键不适用于当前页面。
- 手机使用左下摇杆移动，拖动场景转视角，点击交互按钮。
- 墙体 / 家具 / 人物碰撞、相机遇墙收近、道具调查、抽屉打开与三位人物交谈。
- 刘看山使用用户提供的 Lux3D + Blender 静态模型，在 Blender 中整理表面并添加骨骼，支持待机、行走与快走；不是官方提供的 3D 素材。熊、燕子、企鹅为符合角色身份的原创动物模型，不宣称是知乎其他官方 IP。
- 《蓝血》整合版的五题答案、日记、关键证据、辅助证据、干扰项和三名 NPC 的知识边界集中在 `public/blueblood-case.mjs`；自由问答由大模型按各自边界扮演（见文末 2026-09-13 一节），结案评分按五个问题分别计算。
- 2026-09-11 真实感首轮：统一冷色窗光与暖色室内实灯，降低曝光；为门厅、门牌 402、书桌、木柜、纸箱和沙发增加圆角受光；补充门牌立体数字、窗帘褶皱、楼外建筑和与角色身份对应的生活物件。它们仍属于新增改编，不应当被误认作知乎原文事实。
- Three.js 固定为 0.180.0，浏览器直接加载 `public/vendor/three/`，无需第三方 CDN 在线连接；MIT 许可证随引擎保留。
- 当前家具来自 Kenney Furniture Kit，采用 CC0 1.0，经 Blender 调整圆角与配色后通过本地 `GLTFLoader` 加载；Poly Haven 的 `old_room` HDR 继续提供环境光。早期 Poly Haven 家具和 PBR 贴图保留在项目中，当前房间不再加载。来源与许可记录在 `public/assets/ASSET-CREDITS.md`。
- `tests/room.test.mjs` 覆盖模型几何、动画数值、碰撞、全部交互点可达性与 DOM 引用。自动测试不代表 GPU 画面和手机真机已验收。

## 微缩旧公寓更新（2026-09-25）

房间采用浅灰泥、低饱和木色和柔和边缘的微缩模型风格。沙发保留在后方凹室，小桌、台灯和书册组成阅读角，窗边座椅、边柜、绿植与收纳物补充生活感。家具、调查点和道具位置由 `public/miniature-layout.mjs` 共同配置；地毯与桌面装饰标记为不阻挡行走。刘看山模型沿用当前版本，案件内容、人物对话与调查操作保持原有规则。

灯光采用入暮时分的悬疑氛围：冷灰蓝窗光与局部暖色台灯形成对照，降低全屋补光和环境反射，窗外天空与建筑同步压暗。暗部保留人物轮廓、通路和调查物件的辨识度。

主家具是从 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) 下载的模型，不是 AI 生成资产。仓库在 `art/room-miniature/source/` 保留适配所需的 15 份未改动原始 GLB、许可和来源说明；完整下载包及其余展开文件为可选本地缓存，不提交。`scripts/prepare-miniature-furniture.py` 可直接使用仓库中的源文件，在 Blender 中居中、落地、整理法线并添加柔和倒角和统一配色，导出到 `public/assets/room-miniature/`；每项来源路径、SHA256 与加工说明记录在该目录的 `manifest.json`，CC0 许可原文为 `License.txt`。

`public/miniature-materials.mjs` 的 `createMiniatureMaterials` 提供墙面、地板和建筑构件的代码辅助材质；`public/miniature-dressing.mjs` 补充资源包中没有的窗帘、窗外环境等辅助构造。家具造型来源与这些辅助制作分别记录在 `public/assets/ROOM-ART-CREDITS.md`。

在项目根目录重建家具和检查布局：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/prepare-miniature-furniture.py
node tests/apartment-navigation.test.mjs
node scripts/check-miniature-navigation.mjs --map output/room-miniature/navigation.svg --json output/room-miniature/navigation-report.json
```

导航检查直接读取实际 GLB 和共享布局，检查家具碰撞、地毯通行、抽屉避让区、卫生间通路与全部调查目标的接近距离。地图和报告写入被 Git 忽略的 `output/room-miniature/`；建筑遮挡、相机和近景操作仍需在 `/room.html` 中查看。

## 刘看山模型更新（2026-09-25）

当前第一章主角使用 `public/assets/characters/liukanshan/liukanshan.glb`，基于用户提供的 `刘看山3D-20260924/刘看山.glb` 制作。原资源由 Lux3D 生成并经过 Blender 修整，为静态模型；本次保留其厚实圆润的体形、四肢与已有手指，整理表面并增加骨骼动画。当前游戏资产高约 1.30 米、56,122 个三角面，使用五种材质。`Idle`、`Walk`、`FastWalk` 均为原地骨骼动画，角色移动仍由游戏控制器负责，行走和快走基准速度分别为 1.55、2.35 世界单位/秒。

- 模型预览：运行本地服务后打开 `http://127.0.0.1:4180/character-preview.html`，可切换正面、侧面、背面、动作及转台。
- 可编辑 Blender 文件：运行下方重建命令后生成 `output/blender/liukanshan/liukanshan.blend`，包含骨骼、三个动作、材质和预览摄影棚。
- 原始资源：`art/characters/liukanshan/source-20260924.glb`，原样保留用户提供的文件；来源与 SHA256 记录见同目录 `README.md`。
- 多角度渲染：重建命令生成 `output/blender/liukanshan/` 内的 `hero.png`、`front.png`、`side.png`、`back.png`。这些渲染图与 `.blend` 属于本地生成输出，不随仓库提交。
- 重建：`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build-liukanshan.py`。该脚本调用 `scripts/prepare-liukanshan-reference.py` 导入并整理原始资源，再添加骨骼、动作和导出；末尾追加 `-- --no-render` 可跳过静态渲染。
- 资产检查：`node tests/kanshan-asset.test.mjs`，直接读取真实 GLB 并采样动画，校验尺寸、蒙皮、脚底和骨骼数值。

修改并重新导出模型后，同时更新 `kanshan-model.mjs` 中的资源版本号，以及预览页和房间入口的模块版本号，避免浏览器沿用旧资源。详细编辑说明见 [角色编辑指南](art/characters/liukanshan/EDITING.md)。

## 本地运行

需要 Node.js 20 以上。

### 给不熟悉命令行的人：双击两个文件就行

项目根目录有两个 macOS 双击即可运行的文件，不需要打开终端、不需要敲任何命令：

| 文件 | 作用 |
|---|---|
| `开始配置.command` | 弹出配置向导，问三个问题，把密钥写进 `.env.local` 并当场验证 |
| `开始游戏.command` | 启动本地服务、自动打开浏览器进入游戏；关掉这个窗口就是停止 |

两个脚本都会自己找 Node.js（PATH 里没有时依次尝试 Homebrew、`/usr/local/bin` 和 WorkBuddy 自带的版本），找不到就打印一段人话告诉你装哪个。`开始游戏.command` 会轮询 `/api/health` 直到服务真正可访问才打开浏览器，避免打开一个「连不上」的页面。

### 给熟悉命令行的人

```bash
npm run setup                  # 挑一家模型厂商、粘贴密钥、设管理员密码
npm start                      # 或 node server.mjs
```

密钥输入时屏幕上只显示圆点，不会被回显，也不会进 shell 历史。手上已经有一串密钥但不确定是哪家的，向导里选 `0`，它会挨个试一遍替你认出来。

想手工配置也可以：

```bash
cp .env.example .env.local     # 然后编辑 .env.local，填入模型地址、模型名、密钥和管理员密码
node server.mjs                # 或 npm start
```

打开 `http://127.0.0.1:4180/`。需要支持 WebGL 2 的浏览器。不要直接双击 HTML（浏览器会限制本地模块加载）。

- 游戏首页：`http://127.0.0.1:4180/`（开场菜单，也是线上链接打开的那一页）
- 第一幕：`http://127.0.0.1:4180/room.html`
- 玩家记录：`http://127.0.0.1:4180/admin`（需要 `ADMIN_PASSWORD`）
- 配置自检：`npm run check:model`（会真实调用两次模型，验证密钥和人设都生效）
- 全部逻辑测试：`npm test`（不联网、不消耗任何额度）

`server.mjs` 同时托管 `public/` 并处理四个接口：`POST /api/npc`、`POST /api/submit`、`GET /api/admin/records`、`GET /api/health`。
密钥只从环境变量或 `.env.local` 读取，永远不会进入前端。`.env.local`、`.env.local.bak-*` 和 `data/` 都已被 git 排除。

部署到项目目录只读的平台（如 Vercel）时，把 `DATA_DIR` 指向可写位置（例如 `/tmp/data`），否则玩家记录写不进去。

只想看静态页面、不接大模型时，也可以直接：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory public
```

此时对话会自动回落到本地既定台词，游戏照常可玩。

## 蓝血第一幕调查现场（2026-09-12）

- 第一幕页面：`room.html`，场景使用 `room-art.mjs` / `room-art.css`，并载入 `blueblood-case.mjs` 案件配置与三个程序化 NPC 形象。
- 2026-09-12 初版采用凹间、侧门洞与实体窗洞布局、Poly Haven 家具和 PBR 材质，并加入 HDR 环境反射、实体遮挡阴影和屏幕空间接触阴影。当前房间美术见上方「微缩旧公寓更新」。
- 默认操控刘看山第三人称行走，拖动环视、滚轮缩放；“观察镜头”中保留各个近景观察位置，按 R 返回主角原来的站位。触屏使用左侧摇杆移动，拖动场景环视，点击附近物件的交互按钮。
- 支持点击调查关键证据、辅助证据和干扰项，阅读五页日记，询问三个 NPC，编辑五题“我的解释”并提交结案。道具调查不会自动替玩家填写备忘录，也不会强制玩家调查某一件物品。
- 请从 HTTP 本地服务器打开；直接双击文件时只会给出提示，前端不会写入任何写死的本地地址。
- `public/assets/ROOM-ART-CREDITS.md` 记录来源、作者与许可。场景错误会提示失败素材，不用方块假装已加载成功。

### 基础观察交互（2026-09-11）

`room.html` 已加入第一层调查体验：点击主要物件会打开“现场观察”卡片。当前覆盖桌子、台灯、旧书、木柜、沙发、402 房门、墙上照片空位，以及厕所的洗漱台、镜子和马桶水箱。观察文字是本地固定内容，不调用大模型；玩家可以打开“调查备忘录”自行记录和推理，系统不会自动替玩家整理线索或下结论。

### 刘看山可操控主角（2026-09-12）

- 在现有写实房间中加入第三人称控制器 `kanshan-player.mjs`。当前使用的绑定角色资产见上方「刘看山模型更新（2026-09-25）」。
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
- 走廊照片为 AI 生成的临时道具美术（`assets/wall-photo-v1.jpg`），不是知乎原文配图。生成提示词见素材记录；定稿剧情需另行核对来源。
- 运行 `node tests/wall-photo.test.mjs` 验证移开后的实际遮挡变化、连续八次归位、动作中重复输入、减少动态效果模式与模型数值。

### 抽屉操作试玩（2026-09-11）

- 选择底部“旧木柜”，或在全景中点击木柜；选择“打开抽屉”，抽屉沿木轨向外滑出，露出真实空腔；“推回抽屉”将其复原。动作中会锁定重复输入。
- 抽屉内部暂时保持空置，只验证真实操作和空间反馈，不自动生成藏物、线索或结论，也不会改写玩家备忘录。
- `drawer.mjs` 提供独立的抽屉前板、拉手、空腔和阻尼动作；运行 `node tests/drawer.test.mjs` 验证开合、输入锁、减少动态效果和几何数值。

## 接入大模型与玩家记录（2026-09-13）

三名当事人的自由问答不再由本地固定台词决定，改为由后端调用大模型即兴扮演；玩家记录也一并落地。

### 每个人只知道自己的那一部分

`public/blueblood-case.mjs` 里一直存在、此前没有任何代码读取的三个字段终于被用上了：

- `facts` —— 他亲眼所见或亲手做过的事，是他唯一可以陈述的内容；
- `lies` —— 他会坚持的谎话（只有培训师有），提示词里明确要求他绝不承认；
- `motive` —— 他真正的目的，被标注为「绝不会主动说出来，被问也只会否认」。

判分用的五道题标准答案不会进入任何人的提示词，否则玩家直接问一句就能拿满分。测试里有专门一项守着这条边界。

此外，玩家在现场看过多少件关键证据会折算成一个「压力档位」（放松 / 防备 / 被逼到角落），只用来影响语气，不作为他知道玩家笔记的理由。同一个问题在同一档位下只问一次模型，换一档才会重新生成。

提示词里还会交代「这起事件里还有谁」，并把每个人的代词写清楚（培训师·方老师是「他」、同事·张薇是「她」、记录员·灰夹克是「他」）。代词直接从人物资料里推断，不另立一份对照表。加这一段是因为实测出现过张薇把培训师说成「她」的情况 —— 三个角色之间称呼不一致，在评委眼里很扎眼。

缓存键包含**提示词的指纹**，所以改了人设、回答规则或压力档措辞之后，相关缓存会自动失效。不这样做的话，改完人设玩家拿到的还是旧台词，而且看上去像是修复没生效（这个问题是在纠正代词时实测撞到的）。

### 成本与容错

提问按「先便宜后昂贵」的顺序处理：校验输入 → 每人限流 → 查缓存 → 合并并发同问 → 当日总预算 → 才真的调用模型。

任何一步没过，接口返回降级信号，前端用它本来就保留的本地既定台词顶上。**模型挂了，游戏仍能完整玩完。** 界面上会如实标注这句台词是「由大模型即兴扮演」还是「使用既定台词」，不会把本地台词说成大模型说的。

调用失败不会扣掉当日额度（失败不该让玩家买单）。单次输出有长度上限，默认每天最多 300 次真实调用、同一访客 5 分钟内最多 14 次。

### 玩家记录

- 游戏侧为每个浏览器生成一个匿名会话编号，只存在本机 localStorage，不含任何身份信息。
- 每次提问、每次结案提交都会落一条记录到 `data/records.jsonl`。
- 结案分数在服务端用 `scoreAnswer` 重算，不采信前端传来的数字。
- IP 只保存按天轮换的短哈希，不保存原始地址。
- 管理员打开 `/admin`，输入 `.env.local` 里的 `ADMIN_PASSWORD`；密码只作为请求头发送，不进网址、不进日志。

### 接口

| 接口 | 说明 |
|---|---|
| `POST /api/npc` | 问某个当事人一句话，返回台词与来源（模型 / 缓存 / 降级） |
| `POST /api/submit` | 提交五题结案，服务端重算分数并记录 |
| `GET /api/admin/records` | 管理员读取记录与统计，需要 `Authorization: Bearer <ADMIN_PASSWORD>` |
| `GET /api/health` | 配置摘要与当日用量，只说「配没配」，不返回值 |

### 配置从哪来

优先级是「真实环境变量 > `.env.local` > `.env`」，所以本地用 `.env.local`、部署时用平台的环境变量，代码一行都不用改。

`npm run setup` 是给不熟悉这些事情的人准备的一步步向导：挑厂商（第一家是永久免费的智谱 GLM-Flash）、粘贴密钥、设管理员密码、当场问一句话验证通不通。手上已有密钥但不确定是哪家时选 `0`，它会依次向四家各发一个字的请求替你认出来。

密钥输入全程不回显（终端里只显示圆点），写进 `.env.local` 后不会被打印回来；管理员密码只有在我们代为随机生成时才会显示，由你自己输入的那种不再回打 —— 免得截图时连密码一起漏出去。

`.env.local` 每次重写前会备份成 `.env.local.bak-<时间戳>`，两者都被 git 排除。测试里专门有一项问 `git check-ignore` 来确认这件事，因为备份文件里装的是上一次的真实密钥，一旦被提交就等于把密钥送上公开仓库。

### 验证方式

`tests/npc-service.test.mjs` 覆盖缓存、限流、预算、失败降级、多轮上下文、人设边界、出戏检测、代词一致性、缓存指纹，以及「密钥不能出现在任何会被提交的文件里」，共 116 项，全部使用假模型，不联网也不消耗额度。

`tests/server-routes.test.mjs` 起一个真服务、发真请求，覆盖接口路径写错时必须返回 JSON 404 而不是回落成首页 HTML、隐藏文件一律 404、无模型时的兜底、超大请求体被挡掉，共 34 项。

`tests/setup-core.test.mjs` 覆盖厂商清单、菜单选项、密钥遮罩、密码兜底、生成的 env 文件内容、参数解析、自动识别，共 64 项；其中有一项静态扫描守着「向导不得重新引入 `node:readline`」，因为那会一次带回两个老毛病：非交互模式下抢走标准输入、以及关不掉密钥回显。

`server.mjs` 不会提供 `.env*`、`data/`、`STORY.md`、`README.md` 以及任何以点开头的路径；带扩展名的未知路径返回 404，不会用首页兜底；任何 `/api/` 开头但没匹配上的路径也返回 JSON 404，避免调用方拿到一坨 HTML 配 200。

### 尚未完成

- 公网部署与知乎 OAuth 登录均已接入（回调地址形如 `https://<域名>/api/auth/zhihu/callback`）；未登录访客在公网会先看到一层「入馆登记」，但它留了「先以访客身份进入」的出口，不会把人堵死；本地地址不设门。
- 知乎直答可以作为备用后端（`ZHIHU_ZHIDA_MODE`），但它当前每日额度极小，默认关闭。
