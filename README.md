# 轨道前哨站 · 卫星编队 (orbit-ship-3d)

基于 **Three.js** 的纯静态 3D 可视化：低地球轨道（LEO 400km）空间站、地球、极光、银河背景，以及沿轨跟随的卫星 / 飞船编队。

## 特性
- 实时飞行遥测面板：轨道速度、距地高度、编队间距等
- 可调节的星链卫星数量、轨道间距、编队参数
- 三视角（编队 / 卫星 / 飞船）跟随 + 自由旋转 / 平移 / 缩放
- 地球昼夜、云层、极光夜侧增强、银河背景
- 自包含：Three.js 以 `vendor/` 本地引入，无需 CDN 或构建步骤

## 技术栈
- Three.js 0.169（ES Module + importmap）
- 纯前端静态站点，零构建

## 目录结构
```
index.html        # 站点入口（自包含，引用 vendor/）
src/              # 应用源码（ES Module）
vendor/three/     # 本地 Three.js（build + 用到的 examples/jsm）
public/textures/  # 地球 / 月亮 / 银河等贴图
```

## 本地运行
```bash
npm install      # 仅本地开发预览需要
node serve.mjs   # 启动本地服务器
```
也可将本仓库整体部署到任意静态托管（已自包含，无需安装依赖）。

## 在线演示
通过 GitHub Pages 自动部署，仓库推送后由 `.github/workflows/deploy.yml` 发布。
地址见仓库 **Settings → Pages**，或仓库首页描述的链接。
