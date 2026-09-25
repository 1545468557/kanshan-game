# 刘看山 · Blender 角色资产

`public/assets/characters/liukanshan/liukanshan.glb` 是游戏资产。当前版本基于用户提供的 `刘看山3D-20260924/刘看山.glb`，原包中的模型由 Lux3D 生成并经过 Blender 修整，为静态资源。项目在保留来源造型的基础上整理表面、添加骨骼和动作；该资源不是官方提供的 3D 素材。

原始文件原样保留为 `art/characters/liukanshan/source-20260924.glb`，SHA256 为 `c1ed8df1733f8d179b5928bba2ee6ab972e1d0757c635fa3a3bdb928001f2230`。来源记录见 [README.md](README.md)。

仓库保留原始 GLB、游戏资产和构建脚本。可编辑的 `output/blender/liukanshan/liukanshan.blend` 与渲染图在运行下方重建命令后生成；整个 `output/` 被 Git 忽略，新克隆的仓库不包含这些输出。

## 打开与编辑

先按下方命令重建，再用 Blender 5.2 打开 `output/blender/liukanshan/liukanshan.blend`。`LIU KANSHAN | game asset` 集合包含骨骼和角色蒙皮网格；`STUDIO | preview only` 包含相机、地面和灯光。骨骼使用 `Idle`、`Walk`、`FastWalk` 三个 Action，可在动作编辑器选择。初始显示待机动作和预览相机。

当前角色保留来源模型厚实圆润的体形、四肢与已有手指。游戏资产约 1.30 米高，五种材质，56,122 个三角面。编辑时检查关节附近的蒙皮权重及动作中的脚掌接地，再导出游戏资产。

## 重建

在项目根目录运行（macOS 默认 Blender 安装路径）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build-liukanshan.py
```

其他安装方式可将命令开头替换为本机 Blender 可执行文件；若 Blender 已加入 PATH，可使用 `blender`。

命令会重建 GLB、可编辑 Blender 文件、模型信息和四张渲染。末尾加 `-- --no-render` 可跳过静态渲染，仍生成 `.blend` 和游戏资产。`build-liukanshan.py` 调用 `scripts/prepare-liukanshan-reference.py`，从保留的 `source-20260924.glb` 导入模型、整理表面与造型，再添加骨骼和动作。重建会覆盖生成文件，因此手动编辑的版本应另存；原始来源文件保持不变。

## 导出契约

- Blender 内为 Z 向上、正面朝 -Y；glTF 导出后为 Y 向上、正面朝 +Z。
- 脚底位于零高度，模型已使用游戏尺寸，控制器不再额外缩放。
- 三个动作必须保留名字 `Idle`、`Walk`、`FastWalk`；动作原地播放，Root 不驱动位移。
- 行走与快走的基准速度为 `Walk: 1.55`、`FastWalk: 2.35` 世界单位/秒；动画节奏需与游戏控制器的实际位移速度配合。
- 只导出角色集合，排除摄影棚；保留蒙皮，使用 GLB 打包。
- 重新导出后同步更新网页资源版本号，再运行 `node tests/kanshan-asset.test.mjs`。

## 查看

运行 `npm start` 后访问 `/character-preview.html`，可旋转、缩放、切换视角和动作；`/room.html` 为实际游戏。默认重建生成 `output/blender/liukanshan/` 下的 `hero.png`、`front.png`、`side.png`、`back.png`。浏览器场景截图需要另行采集，不由构建脚本生成。
