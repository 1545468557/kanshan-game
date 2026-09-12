# 402 旧公寓 · 美术素材记录

## 范围

本版已整合《蓝血》调查原型及可操控主角，不是已完成的正式关卡。刘看山与三个 NPC 已载入；旧版玩法另存在 room-gameplay.html，其脚本未删除。
房间空间、凹间、门洞、门板压线、窗框、五金、布置与灯光为新增美术设计，不属于知乎故事原文事实。不新增作案线索或改变真相。故事改编权限仍待确认。

## 角色

刘看山由 `character-meshes.mjs` 根据项目内的官方形象参考程序化构建，白色轮廓、尖耳、黑鼻、蓝围巾；是临时 3D 近似模型，不是官方提供的 3D 文件。`kanshan-player.mjs` 为其增加转身、步行动画及第三人称控制。熊、鸟、企鹅为原创动物替身，不宣称为知乎的其他官方 IP。此处模型不构成角色或故事的版权授权。

## 照片参考

用户提供的 Peter Herrmann / Unsplash 旧房照片截图，只用于构图和气质参考，没有将照片、网页头像或 UI 放入三维场景，也没有声称完成摄影级一比一复刻。原照片的精确链接尚未取得。

## Poly Haven

以下资产采用 CC0 1.0。许可：https://polyhaven.com/license
家具使用官方 API 返回的 glTF + bin + 1K JPG 材质；下载时验证 MD5 及所有相对引用。

| 用途 | 资产 | 作者 | 来源 |
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
| 环境照明 HDRI（不是场景背景） | old_room | 见来源页 | https://polyhaven.com/a/old_room |

木门为有厚度、压线及五金的独立建筑模型，采用灰泥/木材正常的材质通道制作，非 Poly Haven 成品门。侧边门洞现在布置为旧公寓卫生间，洗漱台、镜子、马桶、瓷砖和管道均为程序化几何，不是下载的成品卫生间模型。rough_pine_door 是材质预览球，已排除；城堡门及高背椅与参考图不符，未在本版使用。

## 可移动墙上照片

`wall-photo-v1.png`（1086 × 1448）由内置 image_gen 生成，用于相框内部的旧走廊道具美术。不是 Peter Herrmann 摄影作品，也不是知乎原文配图或剧情证据。图片在纹理坐标中裁掉平面外框，外部立体木框、挂钉、背板及移开/归位动作由 `wall-photo.mjs` 构建；墙面的变色情况仅作操作演示。

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
