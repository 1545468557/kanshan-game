# 402 旧公寓 · 美术素材记录

## 范围

本版已整合《蓝血》调查原型及可操控主角，不是已完成的正式关卡。刘看山与三个 NPC 已载入；旧版玩法另存在 room-gameplay.html，其脚本未删除。
房间空间、凹间、门洞、门板压线、窗框、五金、布置与灯光为新增美术设计，不属于知乎故事原文事实。不新增作案线索或改变真相。故事改编权限仍待确认。

## 角色

当前主角刘看山基于用户提供的 `刘看山3D-20260924/刘看山.glb`，原包说明为 Lux3D 生成、经过 Blender 修整的静态资源。原文件原样保存在 `art/characters/liukanshan/source-20260924.glb`，SHA256 为 `c1ed8df1733f8d179b5928bba2ee6ab972e1d0757c635fa3a3bdb928001f2230`。

`scripts/build-liukanshan.py` 调用 `scripts/prepare-liukanshan-reference.py` 导入原资源，保留厚实圆润的身体、四肢与已有手指，整理表面并添加待机、行走和快走骨骼动画。游戏使用 `characters/liukanshan/liukanshan.glb`，高约 1.30 米，56,122 个三角面，五种材质。`kanshan-model.mjs` 负责资源与动画，`kanshan-player.mjs` 负责第三人称控制。

该三维资源不是官方提供的 3D 文件。制作时曾参考知乎官方图片（https://static.zhihu.com/liukanshan/images/corridor/poster/liukanshan-06576e0f.png）和本地生成的刘看山三视图；这些工作参考不随本次仓库提交。仓库保留原始 GLB、游戏资产和处理脚本，可编辑 Blender 文件与渲染预览在运行构建命令后生成到被 Git 忽略的 `output/blender/liukanshan/`；步骤见 [角色编辑指南](../../art/characters/liukanshan/EDITING.md)。旧程序化主角仍存在于历史演示代码；熊、鸟、企鹅仍为原创动物替身，不宣称为知乎的其他官方 IP。此处模型不构成角色或故事的版权授权。

## 照片参考

用户提供的 Peter Herrmann / Unsplash 旧房照片截图，只用于构图和气质参考，没有将照片、网页头像或 UI 放入三维场景，也没有声称完成摄影级一比一复刻。原照片的精确链接尚未取得。

## 当前家具：Kenney Furniture Kit

微缩旧公寓的沙发、桌椅、书柜、边柜、台灯、书册、地毯、靠垫、植物、收纳箱和收音机选自 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)，作者 Kenney，许可为 **CC0 1.0**。原始资源包的 `License.txt` 标识为 Furniture Kit 2.0。家具为下载的现成 3D 模型，不是 AI 生成资产。

仓库在项目根目录下的 `art/room-miniature/source/` 保留适配所需的 15 份未改动原始 GLB 和下载说明，原许可位于 `art/room-miniature/source/kenney-furniture-kit/License.txt`。完整 ZIP 及其余展开文件为可选本地缓存，被 Git 忽略。适配后的 GLB 位于 `public/assets/room-miniature/`，该目录保留一份 `License.txt`；`manifest.json` 记录每项源文件路径、SHA256、导出信息与加工说明。来源说明中的 140 模型检查是完整原包的审计结果，新克隆默认只包含所需的 15 份源模型。

适配脚本 `scripts/prepare-miniature-furniture.py` 可直接使用仓库保留的源文件，通过 Blender 保留原模型部件，应用来源变换、居中落地、清理平面和法线，并按模型添加柔和倒角与低饱和配色。摆放、调查点、道具与抽屉配置集中在 `public/miniature-layout.mjs`；主角资产沿用前文记录的版本。

`public/miniature-materials.mjs` 中的 `createMiniatureMaterials` 生成墙面、地板和建筑部件的辅助材质。`public/miniature-dressing.mjs` 制作资源包没有提供的窗帘、窗外环境等辅助构造。这些代码制作部分与 Kenney 家具来源分别记录；摄影棚式灯光布置、门窗和卫生间交互构造仍为项目内制作。

## Poly Haven：当前环境光与历史素材

以下资产采用 CC0 1.0。许可：https://polyhaven.com/license
当前微缩房间继续加载 `old_room.hdr` 作为环境照明。下表中的 Poly Haven 大件家具、书籍模型和 PBR 表面贴图为历史版本资产，保留在项目中，当前房间不再加载。历史家具使用官方 API 返回的 glTF + bin + 1K JPG 材质，下载时验证 MD5 及所有相对引用。

| 当前或历史用途 | 资产 | 作者 | 来源 |
|---|---|---|---|
| 休息凹间沙发 | Sofa_01 | Kirill Sannikov | https://polyhaven.com/a/Sofa_01 |
| 旧木椅 | painted_wooden_chair_02 | Kirill Sannikov | https://polyhaven.com/a/painted_wooden_chair_02 |
| 圆木桌 | round_wooden_table_01 | Ulan Cabanilla | https://polyhaven.com/a/round_wooden_table_01 |
| 台灯 | desk_lamp_arm_01 | Kuutti Siitonen（模型/材质）、Yann Kervran（绑定） | https://polyhaven.com/a/desk_lamp_arm_01 |
| 旧木柜 | vintage_cabinet_01 | Rico Cilliers | https://polyhaven.com/a/vintage_cabinet_01 |
| 旧书 | book_encyclopedia_set_01 | John Malcolm | https://polyhaven.com/a/book_encyclopedia_set_01 |
| 凹间墙面 PBR | worn_plaster_wall | 见来源页 | https://polyhaven.com/a/worn_plaster_wall |
| 木构件 PBR | wood_peeling_paint_weathered | 见来源页 | https://polyhaven.com/a/wood_peeling_paint_weathered |
| 地板 PBR | old_wooden_floor_02 | 见来源页 | https://polyhaven.com/a/old_wooden_floor_02 |
| 普通灰泥 PBR | grey_plaster | 见来源页 | https://polyhaven.com/a/grey_plaster |
| 当前环境照明 HDRI（不是场景背景） | old_room | 见来源页 | https://polyhaven.com/a/old_room |

木门为项目内制作的有厚度、压线及五金的独立建筑模型，当前采用微缩房间的辅助材质。侧边门洞布置为旧公寓卫生间，洗漱台、镜子、马桶、瓷砖和管道均为程序化几何，不是下载的成品卫生间模型。历史筛选中的 rough_pine_door 是材质预览球，未用于木门；城堡门及高背椅也未采用。

## 可移动墙上照片

`wall-photo-v1.jpg`（1086 × 1448）由内置 image_gen 生成，用于相框内部的旧走廊道具美术。不是 Peter Herrmann 摄影作品，也不是知乎原文配图或剧情证据。图片在纹理坐标中裁掉平面外框，外部立体木框、挂钉、背板及移开/归位动作由 `wall-photo.mjs` 构建；墙面的变色情况仅作操作演示。

生成提示词（原样记录）：

```text
Use case: photorealistic-natural
Asset type: in-game wall photograph texture for a realistic old apartment mystery scene
Primary request: a small aged monochrome photograph of an empty 1970s apartment corridor, viewed straight on as if inside a simple wooden frame; no people, no readable text, no logos, no watermark
Scene/backdrop: faded paper photo with slight silvering and water damage at the corners
Subject: an empty apartment hallway with a closed door at the far end and one dim ceiling light
Style/medium: realistic archival black-and-white photograph, subtle film grain, not horror, not surreal
Composition/framing: portrait 4:3 crop, centered, enough quiet detail to read when used as a small wall photograph
Lighting/mood: low-contrast overcast light, quiet and ambiguous
Materials/textures: matte old photo paper, slight crease and softened edges
Constraints: no characters, no text, no clues, no dramatic symbols; this is only a replaceable prop texture
Avoid: illustration, CGI render, bright modern interior, blood, ghosts, fingerprints, UI
```

## Three.js

水箱操作样例由新增的 `cistern.mjs` 构建空腔、陶瓷盖板和正常管件，并提供取盖/归位动作；不使用外部水箱模型，没有加入新的故事证据或真相。调查备忘录只保存玩家手写内容。

本地 Three.js / examples 版本 0.180.0，MIT 许可见 ../vendor/three/LICENSE。
使用 OrbitControls、GLTFLoader、RGBELoader、EffectComposer、RenderPass、SSAOPass、OutputPass。依赖均本地保存，没有第三方运行时 CDN 请求。

上述开源素材许可不授予知乎 IP 或故事版权，也不表示素材作者参与、认可或赞助本作品。

## 音乐与音效

序幕动画的配乐和操作音效也是外部素材，署名要求同样必须保留：

- `bgm-piano.mp3` —— 埃里克·萨蒂《Gymnopédie No. 1》，钢琴演奏 Daria Baiocchi（施坦威 B 型录制）。曲目本身已进入公有领域，录音采用 **CC BY-SA 4.0**，来源 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Satie_Gymnop%C3%A8die_n.1_DariaBaiocchi.wav)。本项目做了本地滤波、响度归一与转码。
- `ui-soft-chime.mp3` —— `gsb1039` 录制的钟鸣，**CC0**，来源 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:415061_gsb1039_clock-chime-tubebells-handbells-vibes.wav)。本项目做了本地裁剪、滤波、响度归一与转码。
- 影片 `cg1-opening.mp4` 为项目自制合成，不含第三方影片素材。

音乐音量刻意压得很低（低于影片前景音），默认关闭，需要玩家在右上角「声音」或设置里主动打开。完整清单另见 `ASSET-CREDITS.md`。
