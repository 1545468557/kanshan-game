# 第一幕外部 3D 资产记录

本记录包含《知乎——你是否问到了关键线索》第一幕当前使用的外部资产及项目保留的历史素材。当前微缩房间加载 Kenney 家具和 Poly Haven 的 `old_room` HDR；早期 Poly Haven 大件家具及 PBR 贴图保留在项目中，当前房间不再加载。

## 当前家具 — Kenney Furniture Kit

- 作者与来源：[Kenney · Furniture Kit](https://kenney.nl/assets/furniture-kit)。
- 许可：CC0 1.0，原包 `License.txt` 标识 Furniture Kit 2.0。
- 用途：微缩旧公寓的沙发、桌椅、书柜、边柜、灯具、书册、地毯、靠垫、植物、收纳箱和收音机等。
- 原始资料：项目根目录下的 `art/room-miniature/source/`，随仓库保留适配所需的 15 份未改动原始 GLB、下载说明和许可。完整 ZIP 与其余展开内容为可选本地缓存，被 Git 忽略。
- 游戏文件：`public/assets/room-miniature/*.glb`；许可副本为同目录 `License.txt`。
- 加工：`scripts/prepare-miniature-furniture.py` 可直接使用仓库保留的源文件，通过 Blender 应用原始变换、居中落地、整理法线、增加柔和倒角并统一低饱和配色。
- 追溯：`public/assets/room-miniature/manifest.json` 记录每项源文件、SHA256、导出大小、三角面数及加工说明。
- 原包审计：来源说明中的 140 模型检查针对完整下载包；新克隆默认包含所需的 15 份源模型。

主家具来自下载的 Kenney 模型，不是 AI 生成资产。`public/miniature-materials.mjs` 的 `createMiniatureMaterials` 提供代码辅助材质；`public/miniature-dressing.mjs` 补充资源包没有的窗帘和窗外环境等构造。家具来源、项目内辅助构造和主角来源的完整记录见 `ROOM-ART-CREDITS.md`。

## 当前环境光 — Poly Haven Old Room

- 来源页：[Poly Haven · Old Room](https://polyhaven.com/a/old_room)。
- 文件：`public/assets/materials/old_room.hdr`。
- 用途：室内环境照明与反射，继续用于微缩房间。
- 许可：CC0 1.0。

## 历史素材 — Poly Haven Painted Wooden Cabinet

- 来源页：https://polyhaven.com/a/painted_wooden_cabinet
- 历史用途：早期 402 房间后墙的旧木柜；当前微缩房间不加载
- 格式：glTF 2.0 + 1K JPEG 贴图
- 许可：CC0 1.0

## 历史素材 — Poly Haven Wood Floor

- 来源页：https://polyhaven.com/a/wood_floor
- 历史用途：房间地面 PBR 材质（颜色、法线、粗糙度）；当前微缩房间不加载
- 格式：1K JPEG 贴图（原为 1K PNG，交付前为缩减体积转码，见下方「交付前压缩」）
- 许可：CC0 1.0

## Three.js GLTFLoader

- 来源页：https://github.com/mrdoob/three.js/tree/r180/examples/jsm/loaders
- 用途：在浏览器内加载 glTF 模型
- 版本：0.180.0，与项目内 Three.js 引擎一致
- 许可：MIT（许可证见 `../vendor/three/LICENSE`）

外部资产只作为美术素材使用，不代表 Kenney、Poly Haven、Three.js 或素材作者参与知乎项目，也不改变知乎 IP 的权利归属。刘看山素材和知乎故事来源另行记录。

## 历史版本的交付前压缩

为缩短早期版本的线上首次加载时间，当时对本地打包资源做了两步处理，**没有改变任何素材的来源、作者或 CC0 许可，也没有修改当时的画面构图**：

1. 把原来的 PNG 大图重新编码为 JPEG；界面大图与截图类贴图用质量 85，PBR 贴图用质量 80；
2. 把 2048 × 2048 的墙体/地板 PBR 贴图降到 1024 × 1024。

压缩前后同机位实拍的差异（平均通道差 1%）小于同一版本连续两次渲染之间的差异，即肉眼不可辨。原始素材仍保留在本项目仓库之外的备份目录中。

## Audio

- `bgm-piano.mp3`: *Gymnopédie No. 1*, piano performance by Daria Baiocchi, recorded on a Steinway & Sons B. CC BY-SA 4.0, sourced from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Satie_Gymnop%C3%A8die_n.1_DariaBaiocchi.wav). The composition by Erik Satie is public domain. The MP3 is a locally filtered/normalized/encoded derivative for the game.
- `ui-soft-chime.mp3`: clock chime by `gsb1039`, [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:415061_gsb1039_clock-chime-tubebells-handbells-vibes.wav), CC0. Locally trimmed, filtered, normalized, and encoded for the game.

Playback is intentionally restrained: the piano is kept below the cinematic foreground audio, with a short fade-in/out handled by the browser media flow.
