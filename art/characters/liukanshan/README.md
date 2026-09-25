# 刘看山 · 原始模型来源

`source-20260924.glb` 是用户提供的静态模型，原样复制自资源包中的 `刘看山3D-20260924/刘看山.glb`。用户提供的资源包记录其制作流程为 Lux3D 生成、Blender 修整；这不是官方提供的 3D 素材。

原始文件 SHA256：

```text
c1ed8df1733f8d179b5928bba2ee6ab972e1d0757c635fa3a3bdb928001f2230
```

此文件作为可复现的来源保留。模型包含厚实圆润的身体和四肢，手指已在原资源中建好。游戏需要的骨骼和 `Idle`、`Walk`、`FastWalk` 动作由本项目后续添加。

## 处理与输出

在项目根目录运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build-liukanshan.py
```

`build-liukanshan.py` 调用 `scripts/prepare-liukanshan-reference.py`，导入原始文件并保留来源造型、整理表面、添加骨骼和原地动画，随后生成以下文件：

- 可编辑 Blender 文件：`output/blender/liukanshan/liukanshan.blend`。
- 游戏 GLB：`public/assets/characters/liukanshan/liukanshan.glb`。
- 模型信息：`public/assets/characters/liukanshan/model-info.json`。
- 渲染预览：`output/blender/liukanshan/hero.png`、`front.png`、`side.png`、`back.png`。

当前游戏资产高约 1.30 米，56,122 个三角面，五种材质；原地行走、快走动画分别配合 1.55、2.35 世界单位/秒的移动速度。命令末尾追加 `-- --no-render` 可跳过静态渲染。重建覆盖生成文件，手动编辑的 Blender 版本应另存。

仓库保留原始 GLB、游戏 GLB、模型信息及处理脚本。`output/` 被 Git 忽略；可编辑 `.blend` 与渲染图在运行上述构建命令后生成，不包含在新克隆的仓库中。

运行 `node tests/kanshan-asset.test.mjs` 检查真实导出资产的尺寸、骨骼、蒙皮与动作中的脚底位置。浏览器预览位于 `/character-preview.html`，实际游戏位于 `/room.html`；编辑与导出约定见 [EDITING.md](EDITING.md)。
