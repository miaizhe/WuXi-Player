# Via Music Player

一个专为 Via 浏览器设计的简约音乐播放器脚本。

## 功能特点

- **自动折叠**：1.5秒无操作自动隐藏到侧边，保持页面整洁。
- **动态交互**：播放时封面旋转，带有进度条显示。
- **毛玻璃效果**：适配现代网页审美。
- **多接口支持**：内置多个 Meting API 节点，确保稳定性。

## 使用方法

1. 打开 Via 浏览器。
2. 进入 `设置` -> `脚本` -> `添加脚本`。
3. 将 `Player.js` 的内容复制粘贴进去。
4. 匹配域名建议填写 `*` 或 `https://*/*`。

## 自定义配置

你可以在脚本顶部的 `config` 对象中修改歌单 ID 或平台：

```javascript
const config = {
    server: 'netease', // 平台: netease, tencent, kino, xiami, baidu
    type: 'playlist',  // 类型: playlist, song, album, search, artist
    id: '10046455237', // 歌单/歌曲 ID
    // ...
};
```

## 本地开发

1. 克隆或下载本项目。
2. 运行 `npm install` (可选)。
3. 运行 `npm run serve` 启动本地测试服务器。
4. 访问 `http://localhost:3000` 预览效果。

## 开源协议

MIT
