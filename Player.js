// ==UserScript==
// @name         WuXi Music Player
// @namespace    https://github.com/miaizhe/WuXi-Player
// @version      0.3
// @description  一个基于用户脚本的音乐播放器，支持网易云、QQ音乐、酷狗音乐、虾米音乐、百度音乐等平台。
// @author       Miaizhe
// @run-at       document-start
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function() {
    // 1. 配置信息
    const config = {
        server: 'netease',
        type: 'playlist',
        id: '10046455237',
        apis: [
            'https://api.i-meto.com/meting/api',
            'https://api.injahow.cn/meting/',
            'https://api.moeyao.cn/meting/'
        ]
    };
    let playlist = [];
    let currentIndex = 0;
    let autoHideTimer = null; // 自动隐藏计时器
    let lyrics = []; // 歌词解析结果
    let currentLrcIndex = -1;
    let configSettings = {
        speed: 1.0,
        loop: 'all', // all, one
        showLrc: true,
        lrcColor: '#ffffff',
        lrcActiveColor: '#007aff',
        lrcOpacity: 0.6,
        showVisualizer: true,
        showFloatingBall: true,
        ballPos: { x: 10, y: 80 },
        lrcPos: { y: 20 },
        lrcSize: 14
    };
    // 读取保存的设置
    const savedSettings = localStorage.getItem('via-player-settings');
    if (savedSettings) {
        try {
            Object.assign(configSettings, JSON.parse(savedSettings));
        } catch (e) {}
    }

    function saveSettings() {
        localStorage.setItem('via-player-settings', JSON.stringify(configSettings));
    }
    // --- 跨站同步逻辑 ---
    let lastSyncTime = 0;
    function savePlaybackStatus() {
        if (!audio.src || isNaN(audio.currentTime)) return;
        const now = Date.now();
        // 限制保存频率，每 2 秒保存一次，或者在暂停/切歌时立即保存
        if (now - lastSyncTime < 2000 && !audio.paused) return;
        
        const status = {
            currentIndex: currentIndex,
            currentTime: audio.currentTime,
            paused: audio.paused,
            timestamp: now,
            songId: playlist[currentIndex]?.id // 用于校验是否为同一首歌
        };
        localStorage.setItem('via-player-playback-status', JSON.stringify(status));
        lastSyncTime = now;
    }

    function syncPlaybackStatus() {
        const raw = localStorage.getItem('via-player-playback-status');
        if (!raw) return;
        try {
            const status = JSON.parse(raw);
            const now = Date.now();
            // 如果同步数据超过 10 秒，认为是过时数据，不自动同步
            if (now - status.timestamp > 10000) return;

            // 只有当歌曲索引不同，或者进度差异超过 5 秒时才同步
            if (status.currentIndex !== currentIndex) {
                currentIndex = status.currentIndex;
                load(currentIndex).then(() => {
                    audio.currentTime = status.currentTime;
                    if (!status.paused) audio.play().catch(() => {});
                });
            } else if (Math.abs(audio.currentTime - status.currentTime) > 5) {
                audio.currentTime = status.currentTime;
            }
        } catch (e) {}
    }

    // 监听其他标签页的 storage 变化
    window.addEventListener('storage', (e) => {
        if (e.key === 'via-player-playback-status') {
            syncPlaybackStatus();
        }
    });
    
    const audio = new Audio();
    audio.crossOrigin = "anonymous"; // 必须设置，否则无法进行音频分析

    // --- 音频律动逻辑 ---
    let audioCtx, analyser, dataArray, source;
    function initVisualizer() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            draw();
        } catch (e) {
            console.error('Visualizer init failed:', e);
        }
    }

    function draw() {
        requestAnimationFrame(draw);
        if (!configSettings.showVisualizer || !visualizerCanvas) return;
        
        const canvas = visualizerCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = window.innerWidth;
        const height = canvas.height = 60;
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, width, height);
        
        const barWidth = (width / dataArray.length) * 2;
        let barHeight;
        let x = 0;

        const color = configSettings.lrcActiveColor || '#007aff';

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = (dataArray[i] / 255) * height;
            
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.4;
            
            // 绘制圆角矩形
            const r = 2; // 圆角半径
            if (barHeight > r) {
                ctx.beginPath();
                ctx.moveTo(x, height);
                ctx.lineTo(x, height - barHeight + r);
                ctx.quadraticCurveTo(x, height - barHeight, x + r, height - barHeight);
                ctx.lineTo(x + barWidth - 2 - r, height - barHeight);
                ctx.quadraticCurveTo(x + barWidth - 2, height - barHeight, x + barWidth - 2, height - barHeight + r);
                ctx.lineTo(x + barWidth - 2, height);
                ctx.closePath();
                ctx.fill();
            }
            
            x += barWidth;
        }
    }

    // 2. 样式
    const style = document.createElement('style');
    style.innerHTML = `
        :host {
            --lrc-color: #ffffff;
            --lrc-active-color: #007aff;
            --lrc-opacity: 0.6;
            --ball-x: 10px;
            --ball-y: 80px;
            --lrc-y: 20px;
            --lrc-font-size: 14px;
        }
        #js-mini-player {
            position: fixed !important; 
            bottom: var(--ball-y, 80px) !important; 
            left: var(--ball-x, 0) !important; 
            z-index: 2147483645 !important; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; 
            display: flex !important; align-items: center !important;
            background: rgba(255, 255, 255, 0.95) !important; 
            backdrop-filter: blur(10px) !important;
            padding: 10px !important;
            border-radius: 0 30px 30px 0 !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
            width: 300px !important; height: 65px !important;
            transform: translateX(0) !important;
            border: 1px solid rgba(0,0,0,0.05) !important;
            user-select: none !important;
            pointer-events: auto !important;
            box-sizing: border-box !important;
            margin: 0 !important;
        }
        #js-mini-player * { box-sizing: border-box !important; margin: 0; padding: 0; }
        #js-mini-player.is-hidden { 
            transform: translate(calc(var(--ball-x) * -1 - 260px), 0) !important; 
            opacity: 0.8 !important;
            cursor: pointer !important;
        }
        #js-mini-player.is-hidden:hover {
            opacity: 1 !important;
            transform: translate(calc(var(--ball-x) * -1 - 250px), 0) !important;
        }
        #js-mini-player.is-hidden.has-ball {
            transform: scale(0) !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        /* 悬浮球样式 */
        #p-floating-ball {
            position: fixed !important;
            bottom: var(--ball-y, 80px) !important;
            left: var(--ball-x, 10px) !important;
            width: 45px !important;
            height: 45px !important;
            background: rgba(255, 255, 255, 0.9) !important;
            backdrop-filter: blur(10px) !important;
            border-radius: 50% !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            z-index: 2147483646 !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            border: 1px solid rgba(0,0,0,0.05) !important;
            opacity: 0 !important;
            transform: scale(0) !important;
            pointer-events: none !important;
        }
        #p-floating-ball.is-visible {
            opacity: 1 !important;
            transform: scale(1) !important;
            pointer-events: auto !important;
        }
        #p-floating-ball:hover {
            transform: scale(1.1) !important;
            box-shadow: 0 6px 20px rgba(0,0,0,0.2) !important;
        }
        #p-floating-ball img {
            width: 70% !important;
            height: 70% !important;
            border-radius: 50% !important;
            animation: p-rotate 5s linear infinite !important;
            animation-play-state: paused !important;
        }
        #p-floating-ball.is-playing img {
            animation-play-state: running !important;
        }
        @keyframes p-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        #p-cover { 
            width: 45px; height: 45px; border-radius: 50%; 
            margin-right: 12px; object-fit: cover; background: #eee; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            transition: transform 0.5s linear;
        }
        #p-cover.is-playing {
            animation: rotate 10s linear infinite;
        }
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .p-info { flex: 1 !important; overflow: hidden !important; display: block !important; }
        .p-title { font-size: 13px !important; font-weight: 600 !important; color: #333 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        .p-artist { font-size: 11px !important; color: #888 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        .p-controls { display: flex !important; gap: 6px !important; margin-left: 10px !important; }
        .p-btn { 
            cursor: pointer !important; background: #f5f5f7 !important; width: 30px !important; height: 30px !important; 
            border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; 
            font-size: 14px !important; transition: all 0.2s ease !important;
            color: #555 !important; border: none !important;
        }
        .p-btn:hover { background: #007aff; color: #fff; transform: scale(1.1); }
        .p-btn:active { transform: scale(0.9); }
        
        /* 歌单列表样式 */
        #p-list-container {
            position: absolute !important; 
            bottom: var(--panel-bottom, 100%) !important; 
            top: var(--panel-top, auto) !important;
            left: 0 !important; width: 100% !important; 
            max-height: 0 !important; background: rgba(255, 255, 255, 0.98) !important; 
            backdrop-filter: blur(15px) !important; 
            border-radius: var(--panel-radius, 15px 15px 0 0) !important;
            overflow: hidden !important; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
            box-shadow: 0 var(--panel-shadow-y, -5px) 15px rgba(0,0,0,0.05) !important;
            border: 1px solid rgba(0,0,0,0.05) !important;
            display: block !important;
        }
        #p-list-container.is-open {
            max-height: 250px !important;
            overflow-y: auto !important;
        }
        
        /* 设置面板样式 */
        #p-settings-panel {
            position: absolute !important; 
            bottom: var(--panel-bottom, 100%) !important; 
            top: var(--panel-top, auto) !important;
            left: 0 !important; width: 100% !important; 
            max-height: 0 !important; background: rgba(255, 255, 255, 0.98) !important; 
            backdrop-filter: blur(15px) !important; 
            border-radius: var(--panel-radius, 15px 15px 0 0) !important;
            overflow: hidden !important; transition: max-height 0.4s ease !important;
            box-shadow: 0 var(--panel-shadow-y, -5px) 15px rgba(0,0,0,0.05) !important;
            border: 1px solid rgba(0,0,0,0.05) !important;
            z-index: 10 !important;
            display: block !important;
        }
        #p-settings-panel.is-open {
            max-height: 300px !important;
            padding: 15px !important;
            overflow-y: auto !important;
        }
        .setting-row { display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 12px !important; font-size: 13px !important; color: #555 !important; }
        .setting-label { font-weight: 500 !important; }
        .setting-ops { display: flex !important; gap: 5px !important; }
        .op-btn { 
            padding: 4px 8px !important; border-radius: 6px !important; background: #f0f0f2; 
            cursor: pointer !important; transition: 0.2s !important; font-size: 11px !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            color: #333 !important; border: none !important;
            min-width: 30px !important; min-height: 24px !important;
        }
        #p-color-picker {
            width: 20px; height: 20px; padding: 0; border: none; 
            background: none; cursor: pointer; border-radius: 4px;
        }
        #p-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        #p-color-picker::-webkit-color-swatch { border: 1px solid #ddd; border-radius: 4px; }
        .p-slider {
            flex: 1; margin-left: 10px; height: 4px; -webkit-appearance: none;
            background: #f0f0f2; border-radius: 2px; outline: none;
        }
        .p-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px;
            background: #007aff; border-radius: 50%; cursor: pointer;
            transition: transform 0.2s;
        }
        .p-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .setting-value { font-size: 11px; color: #888; min-width: 30px; text-align: right; margin-left: 5px; }
        .op-btn.is-active { 
            background: #007aff; color: #fff; 
            box-shadow: 0 0 0 2px #007aff !important;
        }
        /* 颜色按钮激活时不改变背景色 */
        #p-lrc-color-ops .op-btn.is-active,
        #p-lrc-active-color-ops .op-btn.is-active {
            background-color: unset;
            border: 2px solid #007aff !important;
        }
        
        /* 歌词展示 */
        #p-lrc-container {
            position: fixed !important; 
            bottom: var(--lrc-y, 20px) !important; 
            left: 0 !important; right: 0 !important;
            z-index: 2147483647 !important; min-height: 50px !important; pointer-events: none !important; text-align: center !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            transition: opacity 0.3s ease, bottom 0.3s ease !important; opacity: 0 !important;
            margin: 0 !important; padding: 0 !important;
        }
        #p-lrc-container.is-visible { opacity: 1 !important; }
        #p-lrc-text {
            background: rgba(0, 0, 0, var(--lrc-opacity)) !important; 
            color: var(--lrc-color) !important; 
            padding: 8px 20px !important;
            border-radius: 20px !important; 
            font-size: var(--lrc-font-size, 14px) !important; 
            backdrop-filter: blur(8px) !important;
            white-space: pre-wrap !important; 
            overflow: hidden !important;
            position: relative !important;
            max-width: 80% !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
            pointer-events: auto !important;
            cursor: default !important;
            user-select: none !important;
            line-height: 1.5 !important;
            word-break: break-all !important;
            display: inline-block !important;
            text-align: center !important;
        }
        
        /* 编辑模式样式 */
        #p-lrc-container.is-editing #p-lrc-text {
            outline: 2px dashed #007aff !important;
            outline-offset: 4px !important;
            cursor: move !important;
            background: rgba(0, 122, 255, 0.2) !important;
        }
        .edit-hint {
            position: absolute !important;
            top: -30px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: #007aff !important;
            color: #fff !important;
            padding: 2px 8px !important;
            border-radius: 4px !important;
            font-size: 10px !important;
            white-space: nowrap !important;
            display: none !important;
        }
        #p-lrc-container.is-editing .edit-hint { display: block !important; }
        
        /* 歌词高亮效果 */
        #p-lrc-text::after {
            content: attr(data-text);
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            padding: 8px 20px !important;
            color: var(--lrc-active-color) !important;
            width: 100% !important; 
            height: 100% !important;
            overflow: hidden !important; 
            white-space: pre-wrap !important;
            word-break: break-all !important;
            transition: clip-path 0.1s linear !important;
            box-sizing: border-box !important;
            display: block !important;
            z-index: 1 !important;
            text-align: center !important;
            clip-path: inset(0 calc(100% - var(--lrc-active-width, 0%)) 0 0) !important;
            pointer-events: none !important;
        }

        .p-list-item {
            padding: 10px 15px; font-size: 12px; color: #444;
            cursor: pointer; display: flex; align-items: center;
            border-bottom: 1px solid rgba(0,0,0,0.03);
            transition: background 0.2s;
        }
        .p-list-item:hover { background: rgba(0,122,255,0.05); }
        .p-list-item.is-active { color: #007aff; font-weight: 600; background: rgba(0,122,255,0.1); }
        .p-list-item-index { width: 20px; color: #999; font-size: 10px; }
        .p-list-item-info { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        /* 隐藏滚动条 */
        #p-list-container::-webkit-scrollbar { width: 4px; }
        #p-list-container::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        
        /* 进度条 */
        .p-progress-container {
            position: absolute !important; 
            bottom: 0 !important; 
            left: 55px !important; 
            right: 20px !important; 
            height: 4px !important;
            background: rgba(0,0,0,0.08) !important; 
            border-radius: 2px !important;
            overflow: hidden !important; cursor: pointer !important; transition: height 0.2s !important;
            display: block !important;
            z-index: 5 !important;
        }
        .p-progress-container:hover {
            height: 6px !important;
            background: rgba(0,0,0,0.12) !important;
        }
        #p-progress {
            height: 100% !important; width: 0%; background: #007aff !important; 
            transition: width 0.1s linear !important;
            position: relative !important;
        }
        #p-progress::after {
            content: "";
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 8px;
            background: #007aff;
            border-radius: 50%;
            box-shadow: 0 0 4px rgba(0,0,0,0.2);
            opacity: 0;
            transition: opacity 0.2s;
        }
        .p-progress-container:hover #p-progress::after {
            opacity: 1;
        }

        /* 律动频谱样式 */
        #p-visualizer {
            position: fixed !important; bottom: 0 !important; left: 0 !important; width: 100% !important; height: 100px !important;
            pointer-events: none !important; z-index: 2147483640 !important; opacity: 0.6 !important;
        }
    `;
    // 3. 初始化 UI (使用 Shadow DOM 彻底隔离样式)
    const host = document.createElement('div');
    host.id = 'via-music-player-host';
    host.style.cssText = 'position:fixed; z-index:2147483640; bottom:0; left:0; width:0; height:0; overflow:visible;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // 将样式和结构放入 Shadow DOM
    shadow.appendChild(style);
    
    const container = document.createElement('div');
    container.id = 'js-mini-player';
    container.className = 'is-hidden'; 
    container.innerHTML = `
        <div id="p-list-container"></div>
        <div id="p-settings-panel">
            <div class="setting-row">
                <span class="setting-label">播放倍速</span>
                <div class="setting-ops" id="p-speed-ops">
                    <span class="op-btn" data-speed="0.5">0.5x</span>
                    <span class="op-btn is-active" data-speed="1.0">1.0x</span>
                    <span class="op-btn" data-speed="1.5">1.5x</span>
                    <span class="op-btn" data-speed="2.0">2.0x</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">循环模式</span>
                <div class="setting-ops" id="p-loop-ops">
                    <span class="op-btn is-active" data-mode="all">全部循环</span>
                    <span class="op-btn" data-mode="one">单曲循环</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">显示歌词</span>
                <div class="setting-ops" id="p-lrc-ops">
                    <span class="op-btn is-active" data-lrc="on">开启</span>
                    <span class="op-btn" data-lrc="off">关闭</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">歌词颜色</span>
                <div class="setting-ops" id="p-lrc-color-ops">
                    <span class="op-btn" data-color="#ffffff" style="background:#fff;border:1px solid #ddd"></span>
                    <span class="op-btn" data-color="#ffeb3b" style="background:#ffeb3b"></span>
                    <span class="op-btn" data-color="#4caf50" style="background:#4caf50"></span>
                    <span class="op-btn" data-color="#007aff" style="background:#007aff"></span>
                    <span class="op-btn" id="p-custom-color-btn" title="自定义颜色" style="position: relative; overflow: hidden; background: #fff;">
                        <input type="color" id="p-color-picker" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                        🎨
                    </span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">歌词高亮</span>
                <div class="setting-ops" id="p-lrc-active-color-ops">
                    <span class="op-btn" data-color="#007aff" style="background: #007aff"></span>
                    <span class="op-btn" data-color="#ff2d55" style="background: #ff2d55"></span>
                    <span class="op-btn" data-color="#ffcc00" style="background: #ffcc00"></span>
                    <span class="op-btn" data-color="#4cd964" style="background: #4cd964"></span>
                    <span class="op-btn" id="p-active-custom-color-btn" title="自定义高亮" style="position: relative; overflow: hidden; background: #007aff;">
                        <input type="color" id="p-active-color-picker" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                        ✨
                    </span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">显示悬浮球</span>
                <div class="setting-ops" id="p-floating-ops">
                    <span class="op-btn" data-ball="on">开启</span>
                    <span class="op-btn" data-ball="off">关闭</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">律动频谱</span>
                <div class="setting-ops" id="p-visualizer-ops">
                    <span class="op-btn" data-viz="on">开启</span>
                    <span class="op-btn" data-viz="off">关闭</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">背景透明</span>
                <input type="range" id="p-lrc-opacity-slider" class="p-slider" min="0" max="1" step="0.01" value="0.6">
                <span id="p-lrc-opacity-val" class="setting-value">60%</span>
            </div>
            <div class="setting-row">
                <span class="setting-label">编辑模式</span>
                <div class="setting-ops">
                    <button class="op-btn" id="p-edit-lrc-btn">歌词编辑</button>
                </div>
            </div>
            <div class="setting-row" id="p-lrc-size-row" style="display:none;">
                <span class="setting-label">歌词大小</span>
                <input type="range" class="p-slider" id="p-lrc-size-slider" min="12" max="30" step="1">
                <span class="setting-value" id="p-lrc-size-value">14px</span>
            </div>
        </div>
        <img id="p-cover" src="">
        <div class="p-info">
            <div id="p-title" class="p-title">正在解析歌单...</div>
            <div id="p-artist" class="p-artist"></div>
        </div>
        <div class="p-controls">
            <div class="p-btn" id="p-settings-toggle" title="设置">⚙️</div>
            <div class="p-btn" id="p-list-toggle" title="播放列表">📋</div>
            <div class="p-btn" id="p-prev" title="上一首">⏮</div>
            <div class="p-btn" id="p-play" title="播放/暂停">▶</div>
            <div class="p-btn" id="p-next" title="下一首">⏭</div>
        </div>
        <div class="p-progress-container">
            <div id="p-progress"></div>
        </div>
    `;
    shadow.appendChild(container);

    const floatingBall = document.createElement('div');
    floatingBall.id = 'p-floating-ball';
    floatingBall.innerHTML = '<img id="p-ball-img" src="">';
    shadow.appendChild(floatingBall);

    const lrcContainer = document.createElement('div');
    lrcContainer.id = 'p-lrc-container';
    lrcContainer.innerHTML = `
        <div id="p-lrc-text">
            <div class="edit-hint">拖拽调整位置</div>
            等候播放...
        </div>
    `;
    shadow.appendChild(lrcContainer);

    const visualizerCanvas = document.createElement('canvas');
    visualizerCanvas.id = 'p-visualizer';
    shadow.appendChild(visualizerCanvas);

    const playBtn = shadow.getElementById('p-play');
    const listToggle = shadow.getElementById('p-list-toggle');
    const listContainer = shadow.getElementById('p-list-container');
    const settingsToggle = shadow.getElementById('p-settings-toggle');
    const settingsPanel = shadow.getElementById('p-settings-panel');
    const lrcText = shadow.getElementById('p-lrc-text');
    const progressContainer = shadow.querySelector('.p-progress-container');
    const progressBar = shadow.getElementById('p-progress');
    
    // --- 核心逻辑：自动隐藏计时器 ---
    
    function startAutoHide() {
        if (listContainer.classList.contains('is-open') || settingsPanel.classList.contains('is-open')) return;
        clearTimeout(autoHideTimer);
        autoHideTimer = setTimeout(() => {
            container.classList.add('is-hidden');
            if (configSettings.showFloatingBall) {
                container.classList.add('has-ball');
                floatingBall.classList.add('is-visible');
            } else {
                container.classList.remove('has-ball');
            }
        }, 1500);
    }
    function cancelAutoHide() {
        clearTimeout(autoHideTimer);
    }
    
    // 强制弹出
    function showPlayer() {
        cancelAutoHide();
        container.classList.remove('is-hidden');
        container.classList.remove('has-ball');
        floatingBall.classList.remove('is-visible');
    }
    
    let isDragging = false;
    let startX, startY;
    let initialBallX, initialBallY;

    floatingBall.onmousedown = (e) => {
        isDragging = false; // 重置
        startX = e.clientX;
        startY = e.clientY;
        initialBallX = configSettings.ballPos.x;
        initialBallY = configSettings.ballPos.y;
        
        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                isDragging = true;
                const newX = initialBallX + dx;
                const newY = initialBallY - dy; // bottom 是向上增加的
                
                // 边界限制
                const maxX = window.innerWidth - 50;
                const maxY = window.innerHeight - 50;
                configSettings.ballPos.x = Math.max(0, Math.min(maxX, newX));
                configSettings.ballPos.y = Math.max(0, Math.min(maxY, newY));
                
                host.style.setProperty('--ball-x', configSettings.ballPos.x + 'px');
                host.style.setProperty('--ball-y', configSettings.ballPos.y + 'px');
            }
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (isDragging) saveSettings();
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // 触摸支持
    floatingBall.ontouchstart = (e) => {
        isDragging = false;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        initialBallX = configSettings.ballPos.x;
        initialBallY = configSettings.ballPos.y;
        
        const onTouchMove = (moveEvent) => {
            const touchMove = moveEvent.touches[0];
            const dx = touchMove.clientX - startX;
            const dy = touchMove.clientY - startY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                isDragging = true;
                const newX = initialBallX + dx;
                const newY = initialBallY - dy;
                
                const maxX = window.innerWidth - 50;
                const maxY = window.innerHeight - 50;
                configSettings.ballPos.x = Math.max(0, Math.min(maxX, newX));
                configSettings.ballPos.y = Math.max(0, Math.min(maxY, newY));
                
                host.style.setProperty('--ball-x', configSettings.ballPos.x + 'px');
                host.style.setProperty('--ball-y', configSettings.ballPos.y + 'px');
                moveEvent.preventDefault(); // 防止滚动
            }
        };
        
        const onTouchEnd = () => {
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            if (isDragging) saveSettings();
        };
        
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    };

    floatingBall.onclick = (e) => {
        e.stopPropagation();
        if (!isDragging) {
            showPlayer();
        }
    };
    // 监听：鼠标进入播放器区域不隐藏，离开则开始倒计时
    container.addEventListener('mouseenter', cancelAutoHide);
    container.addEventListener('mouseleave', startAutoHide);
    
    // 监听：点击页面其他地方立即折叠
    document.addEventListener('click', (e) => {
        const path = e.composedPath();
        if (container && !path.includes(container)) {
            container.classList.add('is-hidden');
            listContainer.classList.remove('is-open');
            settingsPanel.classList.remove('is-open');
            if (configSettings.showFloatingBall) {
                container.classList.add('has-ball');
                floatingBall.classList.add('is-visible');
            }
        }
    });
    // 监听：点击播放器区域（包括按钮）都要取消自动隐藏并强制弹出
    container.addEventListener('click', (e) => {
        showPlayer();
        // 如果点击的是内部按钮，不需要在这里 stopPropagation，按钮自己会处理
        // 但如果点击的是背景，需要 stopPropagation 防止触发 document 的点击逻辑
        if (e.target === container || e.target.id === 'p-cover' || e.target.classList.contains('p-info')) {
            e.stopPropagation();
        }
    }, true); 
    
    // --- 列表/设置弹出方向自动调整 ---
    function updatePanelDirection() {
        const rect = container.getBoundingClientRect();
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (spaceAbove < 320 && spaceBelow > spaceAbove) {
            // 空间不足且下方空间更大，向下弹出
            container.style.setProperty('--panel-bottom', 'auto');
            container.style.setProperty('--panel-top', '100%');
            container.style.setProperty('--panel-radius', '0 0 15px 15px');
            container.style.setProperty('--panel-shadow-y', '5px');
        } else {
            // 默认向上弹出
            container.style.setProperty('--panel-bottom', '100%');
            container.style.setProperty('--panel-top', 'auto');
            container.style.setProperty('--panel-radius', '15px 15px 0 0');
            container.style.setProperty('--panel-shadow-y', '-5px');
        }
    }

    // 列表切换
    listToggle.onclick = (e) => {
        e.stopPropagation();
        updatePanelDirection();
        settingsPanel.classList.remove('is-open');
        listContainer.classList.toggle('is-open');
    };

    // 设置切换
    settingsToggle.onclick = (e) => {
        e.stopPropagation();
        updatePanelDirection();
        listContainer.classList.remove('is-open');
        settingsPanel.classList.toggle('is-open');
    };

    // 设置项点击
    shadow.getElementById('p-speed-ops').onclick = (e) => {
        if (e.target.dataset.speed) {
            configSettings.speed = parseFloat(e.target.dataset.speed);
            audio.playbackRate = configSettings.speed;
            updateOpsActive('p-speed-ops', 'speed', e.target.dataset.speed);
            saveSettings();
        }
    };
    shadow.getElementById('p-loop-ops').onclick = (e) => {
        if (e.target.dataset.mode) {
            configSettings.loop = e.target.dataset.mode;
            updateOpsActive('p-loop-ops', 'mode', e.target.dataset.mode);
            saveSettings();
        }
    };
    shadow.getElementById('p-lrc-ops').onclick = (e) => {
        if (e.target.dataset.lrc) {
            configSettings.showLrc = e.target.dataset.lrc === 'on';
            updateOpsActive('p-lrc-ops', 'lrc', e.target.dataset.lrc);
            if (!configSettings.showLrc) lrcContainer.classList.remove('is-visible');
            saveSettings();
        }
    };
    shadow.getElementById('p-lrc-color-ops').onclick = (e) => {
          if (e.target.dataset.color) {
              configSettings.lrcColor = e.target.dataset.color;
              host.style.setProperty('--lrc-color', configSettings.lrcColor);
              updateOpsActive('p-lrc-color-ops', 'color', e.target.dataset.color);
              saveSettings();
          }
      };
      const colorPicker = shadow.getElementById('p-color-picker');
      colorPicker.oninput = (e) => {
          const color = e.target.value;
          configSettings.lrcColor = color;
          host.style.setProperty('--lrc-color', color);
          shadow.getElementById('p-custom-color-btn').style.background = color;
          // 取消其他预设颜色的激活状态，激活自定义按钮
          shadow.getElementById('p-lrc-color-ops').querySelectorAll('.op-btn').forEach(btn => {
              btn.classList.toggle('is-active', btn.id === 'p-custom-color-btn');
          });
          saveSettings();
      };
      colorPicker.onclick = (e) => e.stopPropagation(); // 防止触发父元素的 onclick
       
       const opacitySlider = shadow.getElementById('p-lrc-opacity-slider');
       const opacityVal = shadow.getElementById('p-lrc-opacity-val');
       opacitySlider.oninput = (e) => {
           const val = e.target.value;
           configSettings.lrcOpacity = val;
           host.style.setProperty('--lrc-opacity', val);
           opacityVal.innerText = Math.round(val * 100) + '%';
           saveSettings();
       };
       opacitySlider.onclick = (e) => e.stopPropagation();

       // 高亮颜色设置
       shadow.getElementById('p-lrc-active-color-ops').onclick = (e) => {
           if (e.target.dataset.color) {
               configSettings.lrcActiveColor = e.target.dataset.color;
               host.style.setProperty('--lrc-active-color', configSettings.lrcActiveColor);
               updateOpsActive('p-lrc-active-color-ops', 'color', e.target.dataset.color);
               saveSettings();
           }
       };
       const activeColorPicker = shadow.getElementById('p-active-color-picker');
       activeColorPicker.oninput = (e) => {
           const color = e.target.value;
           configSettings.lrcActiveColor = color;
           host.style.setProperty('--lrc-active-color', color);
           shadow.getElementById('p-active-custom-color-btn').style.background = color;
           shadow.getElementById('p-lrc-active-color-ops').querySelectorAll('.op-btn').forEach(btn => {
               btn.classList.toggle('is-active', btn.id === 'p-active-custom-color-btn');
           });
           saveSettings();
       };
       activeColorPicker.onclick = (e) => e.stopPropagation();

       shadow.getElementById('p-visualizer-ops').onclick = (e) => {
           if (e.target.dataset.viz) {
               configSettings.showVisualizer = e.target.dataset.viz === 'on';
               updateOpsActive('p-visualizer-ops', 'viz', e.target.dataset.viz);
               visualizerCanvas.style.opacity = configSettings.showVisualizer ? '1' : '0';
               saveSettings();
           }
       };

       shadow.getElementById('p-floating-ops').onclick = (e) => {
        if (e.target.dataset.ball) {
            configSettings.showFloatingBall = e.target.dataset.ball === 'on';
            updateOpsActive('p-floating-ops', 'ball', e.target.dataset.ball);
            if (!configSettings.showFloatingBall) {
                floatingBall.classList.remove('is-visible');
                container.classList.remove('has-ball');
            } else if (container.classList.contains('is-hidden')) {
                floatingBall.classList.add('is-visible');
                container.classList.add('has-ball');
            }
            saveSettings();
        }
    };

    // --- 歌词编辑模式逻辑 ---
     const editLrcBtn = shadow.getElementById('p-edit-lrc-btn');
     const lrcSizeRow = shadow.getElementById('p-lrc-size-row');
     const lrcSizeSlider = shadow.getElementById('p-lrc-size-slider');
     const lrcSizeValue = shadow.getElementById('p-lrc-size-value');

    let isEditingLrc = false;
    editLrcBtn.onclick = (e) => {
        e.stopPropagation();
        isEditingLrc = !isEditingLrc;
        lrcContainer.classList.toggle('is-editing', isEditingLrc);
        editLrcBtn.classList.toggle('is-active', isEditingLrc);
        lrcSizeRow.style.display = isEditingLrc ? 'flex' : 'none';
        
        if (isEditingLrc) {
            lrcContainer.classList.add('is-visible');
            lrcSizeSlider.value = configSettings.lrcSize;
            lrcSizeValue.innerText = configSettings.lrcSize + 'px';
        } else {
            if (audio.paused) lrcContainer.classList.remove('is-visible');
            saveSettings();
        }
    };

    lrcSizeSlider.oninput = (e) => {
        const size = e.target.value;
        configSettings.lrcSize = parseInt(size);
        lrcSizeValue.innerText = size + 'px';
        host.style.setProperty('--lrc-font-size', size + 'px');
    };
    lrcSizeSlider.onclick = (e) => e.stopPropagation();

    let isLrcDragging = false;
    let lrcStartY = 0;
    let initialLrcY = 0;

    const startLrcDrag = (e) => {
        if (!isEditingLrc) return;
        isLrcDragging = true;
        lrcStartY = e.clientY || (e.touches && e.touches[0].clientY);
        initialLrcY = configSettings.lrcPos.y;
        lrcText.style.transition = 'none';
        e.stopPropagation();
    };

    const moveLrcDrag = (e) => {
        if (!isLrcDragging) return;
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const dy = lrcStartY - clientY;
        let newY = initialLrcY + dy;
        newY = Math.max(10, Math.min(window.innerHeight - 100, newY));
        configSettings.lrcPos.y = newY;
        host.style.setProperty('--lrc-y', newY + 'px');
    };

    const endLrcDrag = () => {
        if (!isLrcDragging) return;
        isLrcDragging = false;
        lrcText.style.transition = '';
        saveSettings();
    };

    lrcText.onmousedown = startLrcDrag;
    lrcText.ontouchstart = startLrcDrag;
    window.addEventListener('mousemove', moveLrcDrag);
    window.addEventListener('mouseup', endLrcDrag);
    window.addEventListener('touchmove', moveLrcDrag, { passive: false });
    window.addEventListener('touchend', endLrcDrag);

    function updateOpsActive(parentId, dataAttr, value) {
        shadow.getElementById(parentId).querySelectorAll('.op-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset[dataAttr] === value);
        });
    }

    // 进度条点击/触摸跳转
    const handleProgressClick = (e) => {
        e.stopPropagation();
        if (audio.duration && isFinite(audio.duration)) {
            const rect = progressContainer.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            if (clientX === undefined) return;
            
            const clickX = clientX - rect.left;
            const width = rect.width;
            const seekTime = Math.max(0, Math.min(audio.duration, (clickX / width) * audio.duration));
            audio.currentTime = seekTime;
        }
    };
    progressContainer.onclick = handleProgressClick;
    progressContainer.ontouchstart = handleProgressClick;

    // --- 播放器功能 ---
    async function init() {
        // 应用保存的设置到 UI
        host.style.setProperty('--lrc-color', configSettings.lrcColor);
        host.style.setProperty('--lrc-active-color', configSettings.lrcActiveColor);
        host.style.setProperty('--lrc-opacity', configSettings.lrcOpacity);
        host.style.setProperty('--ball-x', configSettings.ballPos.x + 'px');
        host.style.setProperty('--ball-y', configSettings.ballPos.y + 'px');
        host.style.setProperty('--lrc-y', configSettings.lrcPos.y + 'px');
        host.style.setProperty('--lrc-font-size', configSettings.lrcSize + 'px');
        
        const opacitySlider = shadow.getElementById('p-lrc-opacity-slider');
        const opacityVal = shadow.getElementById('p-lrc-opacity-val');
        opacitySlider.value = configSettings.lrcOpacity;
        opacityVal.innerText = Math.round(configSettings.lrcOpacity * 100) + '%';
        
        shadow.getElementById('p-color-picker').value = configSettings.lrcColor;
        shadow.getElementById('p-active-color-picker').value = configSettings.lrcActiveColor;
        shadow.getElementById('p-custom-color-btn').style.background = configSettings.lrcColor;
        shadow.getElementById('p-active-custom-color-btn').style.background = configSettings.lrcActiveColor;
        
        updateOpsActive('p-speed-ops', 'speed', configSettings.speed.toFixed(1));
        updateOpsActive('p-loop-ops', 'mode', configSettings.loop);
        updateOpsActive('p-lrc-ops', 'lrc', configSettings.showLrc ? 'on' : 'off');
        updateOpsActive('p-floating-ops', 'ball', configSettings.showFloatingBall ? 'on' : 'off');
        updateOpsActive('p-visualizer-ops', 'viz', configSettings.showVisualizer ? 'on' : 'off');
        visualizerCanvas.style.opacity = configSettings.showVisualizer ? '1' : '0';

        // 如果是自定义颜色，激活自定义按钮
        const isPresetColor = Array.from(shadow.getElementById('p-lrc-color-ops').querySelectorAll('[data-color]'))
                                .some(el => el.dataset.color === configSettings.lrcColor);
        if (!isPresetColor) {
            shadow.getElementById('p-lrc-color-ops').querySelectorAll('.op-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.id === 'p-custom-color-btn');
            });
        } else {
            updateOpsActive('p-lrc-color-ops', 'color', configSettings.lrcColor);
        }

        // 高亮颜色同步
        const isPresetActiveColor = Array.from(shadow.getElementById('p-lrc-active-color-ops').querySelectorAll('[data-color]'))
                                .some(el => el.dataset.color === configSettings.lrcActiveColor);
        if (!isPresetActiveColor) {
            shadow.getElementById('p-lrc-active-color-ops').querySelectorAll('.op-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.id === 'p-active-custom-color-btn');
            });
        } else {
            updateOpsActive('p-lrc-active-color-ops', 'color', configSettings.lrcActiveColor);
        }

        for (let base of config.apis) {
            try {
                const r = await fetch(`${base}?server=${config.server}&type=${config.type}&id=${config.id}`);
                const d = await r.json();
                if (d && d.length) { 
                    playlist = d; 
                    renderPlaylist();
                    load(0); 
                    syncPlaybackStatus(); // 加载完歌单后尝试同步上次的播放进度
                    startAutoHide(); 
                    return; 
                }
            } catch (e) {}
        }
        shadow.getElementById('p-title').innerText = "歌单加载失败";
    }

    function renderPlaylist() {
        listContainer.innerHTML = playlist.map((track, i) => `
            <div class="p-list-item" data-index="${i}">
                <div class="p-list-item-index">${i + 1}</div>
                <div class="p-list-item-info">${track.title} - ${track.author}</div>
            </div>
        `).join('');
        
        listContainer.querySelectorAll('.p-list-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const index = parseInt(item.getAttribute('data-index'));
                load(index);
                audio.play().catch(() => {});
            };
        });
    }

    async function load(i) {
        currentIndex= i;
        const track = playlist[i];
        shadow.getElementById('p-title').innerText = track.title;
        shadow.getElementById('p-artist').innerText = track.author || '未知歌手';
        shadow.getElementById('p-cover').src = track.pic;
        shadow.getElementById('p-ball-img').src = track.pic;
        audio.src = track.url;
        audio.playbackRate = configSettings.speed;
        resetProgress();
        
        // 获取歌词
        let lrcContent = track.lrc;
        // 如果 lrc 是 URL，则获取内容
        if (lrcContent && (lrcContent.startsWith('http') || lrcContent.startsWith('//'))) {
            try {
                const res = await fetch(lrcContent);
                lrcContent = await res.text();
            } catch (e) {
                console.error("Fetch lyric failed:", e);
            }
        }
        parseLrc(lrcContent);
        
        // 高亮当前播放项
        listContainer.querySelectorAll('.p-list-item').forEach((item, idx) => {
            item.classList.toggle('is-active', idx === i);
        });
    }

    function parseLrc(lrcContent) {
        lyrics = [];
        currentLrcIndex = -1;
        lrcText.innerText = '';
        if (!lrcContent) return;
        
        const lines = lrcContent.split('\n');
        const pattern = /\[(\d{2}):(\d{2})[.:](\d{2,3})?\]/g;
        const tempLyrics = [];
        
        lines.forEach(line => {
            const pureText = line.replace(pattern, '').trim();
            if (!pureText) return;

            let res;
            pattern.lastIndex = 0; 
            while ((res = pattern.exec(line)) !== null) {
                const min = parseInt(res[1]);
                const sec = parseInt(res[2]);
                const msStr = res[3] || '0';
                const ms = parseInt(msStr) / (msStr.length === 3 ? 1000 : 100);
                const time = min * 60 + sec + ms;
                tempLyrics.push({ time, text: pureText });
            }
        });
        
        if (tempLyrics.length === 0) return;
        
        // 按时间排序
        tempLyrics.sort((a, b) => a.time - b.time);
        
        // 合并时间戳极近的歌词（通常是翻译或多行歌词）
        let current = tempLyrics[0];
        for (let i = 1; i < tempLyrics.length; i++) {
            // 如果两行歌词时间间隔小于 0.8 秒，则认为是翻译或关联行，换行合并
            if (tempLyrics[i].time - current.time < 0.8) {
                current.text += '\n' + tempLyrics[i].text;
            } else {
                lyrics.push(current);
                current = tempLyrics[i];
            }
        }
        lyrics.push(current);
    }

    function resetProgress() {
        progressBar.style.width = '0%';
        // 只有当编辑模式未开启时，才根据播放状态控制歌词可见性
        if (!isEditingLrc) {
            lrcContainer.classList.remove('is-visible');
        }
    }

    audio.ontimeupdate = () => {
        savePlaybackStatus(); // 实时保存进度
        if (audio.duration && isFinite(audio.duration)) {
            const pos = (audio.currentTime / audio.duration) * 100;
            if (progressBar) progressBar.style.width = pos + '%';
            
            // 处理歌词
            if (configSettings.showLrc && lyrics.length) {
                const time = audio.currentTime;
                let index = -1;
                for (let i = 0; i < lyrics.length; i++) {
                    if (time >= lyrics[i].time) index = i;
                    else break;
                }
                
                if (index !== -1) {
                    if (index !== currentLrcIndex) {
                        currentLrcIndex = index;
                        lrcText.innerText = lyrics[index].text;
                        // ::after 伪元素通过 data-text 读取相同文本，配合 white-space: pre-wrap 实现完美对齐
                        lrcText.setAttribute('data-text', lyrics[index].text);
                        lrcContainer.classList.add('is-visible');
                    }
                    
                    // 计算当前行歌词的进度
                    const currentLine = lyrics[index];
                    const nextLine = lyrics[index + 1];
                    
                    // 持续时间：取下一行时间减去当前行时间，如果是最后一行则取 5 秒或直到音频结束
                    let lineDuration = nextLine ? (nextLine.time - currentLine.time) : (audio.duration - currentLine.time);
                    if (lineDuration <= 0 || lineDuration > 10) lineDuration = 5; // 异常处理
                    
                    const elapsed = time - currentLine.time;
                    const lineProgress = Math.min(100, Math.max(0, (elapsed / lineDuration) * 100));
                    lrcText.style.setProperty('--lrc-active-width', lineProgress.toFixed(2) + '%');
                }
            }
        }
    };
    audio.onplay = () => {
        savePlaybackStatus();
        shadow.getElementById('p-cover').classList.add('is-playing');
        floatingBall.classList.add('is-playing');
        playBtn.innerText = '⏸';
    };
    audio.onpause = () => {
        savePlaybackStatus();
        shadow.getElementById('p-cover').classList.remove('is-playing');
        floatingBall.classList.remove('is-playing');
        playBtn.innerText = '▶';
    };// 播放/暂停
    playBtn.onclick = (e) => {
        e.stopPropagation();
        initVisualizer(); // 用户点击时初始化音频上下文
        if (audio.paused) {
            audio.play().catch(err => {
                console.error("Playback failed:", err);
                // 可能是由于浏览器策略导致无法自动播放
            });
        } else {
            audio.pause();
        }
    };
    shadow.getElementById('p-next').onclick = (e) => {
        if (e) e.stopPropagation();
        currentIndex = (currentIndex + 1) % playlist.length;
        load(currentIndex);
        audio.play().catch(() => {});
    };
    shadow.getElementById('p-prev').onclick = (e) => {
        if (e) e.stopPropagation();
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        load(currentIndex);
        audio.play().catch(() => {});
    };
    audio.onended = () => {
        if (configSettings.loop === 'one') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } else {
            // 不直接调用 click() 触发，避免触发 showPlayer 弹出逻辑
            currentIndex = (currentIndex + 1) % playlist.length;
            load(currentIndex);
            audio.play().catch(() => {});
        }
    };
    init();
})();