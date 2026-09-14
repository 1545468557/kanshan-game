# 第一幕外部 3D 资产记录

以下资产用于《知乎——你是否问到了关键线索》第一幕试玩，均随静态 Demo 本地打包。

## Poly Haven — Painted Wooden Cabinet

- 来源页：https://polyhaven.com/a/painted_wooden_cabinet
- 用途：402 房间后墙的旧木柜
- 格式：glTF 2.0 + 1K JPEG 贴图
- 许可：CC0 1.0

## Poly Haven — Wood Floor

- 来源页：https://polyhaven.com/a/wood_floor
- 用途：房间地面 PBR 材质（颜色、法线、粗糙度）
- 格式：1K JPEG 贴图（原为 1K PNG，交付前为缩减体积转码，见下方「交付前压缩」）
- 许可：CC0 1.0

## Three.js GLTFLoader

- 来源页：https://github.com/mrdoob/three.js/tree/r180/examples/jsm/loaders
- 用途：在浏览器内加载 glTF 模型
- 版本：0.180.0，与项目内 Three.js 引擎一致
- 许可：MIT（许可证见 `../vendor/three/LICENSE`）

外部资产只作为美术素材使用，不代表 Poly Haven、Three.js 或素材作者参与知乎项目，也不改变知乎 IP 的权利归属。刘看山素材和知乎故事来源另行记录。

## 交付前压缩

为缩短线上首次加载时间，交付版本对本地打包资源做了两步处理，**没有改变任何素材的来源、作者或 CC0 许可，也没有修改画面构图**：

1. 把原来的 PNG 大图重新编码为 JPEG；界面大图与截图类贴图用质量 85，PBR 贴图用质量 80；
2. 把 2048 × 2048 的墙体/地板 PBR 贴图降到 1024 × 1024。

压缩前后同机位实拍的差异（平均通道差 1%）小于同一版本连续两次渲染之间的差异，即肉眼不可辨。原始素材仍保留在本项目仓库之外的备份目录中。

## Audio

- `bgm-piano.mp3`: *Gymnopédie No. 1*, piano performance by Daria Baiocchi, recorded on a Steinway & Sons B. CC BY-SA 4.0, sourced from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Satie_Gymnop%C3%A8die_n.1_DariaBaiocchi.wav). The composition by Erik Satie is public domain. The MP3 is a locally filtered/normalized/encoded derivative for the game.
- `ui-soft-chime.mp3`: clock chime by `gsb1039`, [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:415061_gsb1039_clock-chime-tubebells-handbells-vibes.wav), CC0. Locally trimmed, filtered, normalized, and encoded for the game.

Playback is intentionally restrained: the piano is kept below the cinematic foreground audio, with a short fade-in/out handled by the browser media flow.
