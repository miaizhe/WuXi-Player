// ==UserScript==
// @name         New Userscript
// @namespace    https://viayoo.com/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @run-at       document-end
// @match        https://*/*
// @grant        none
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
        showVisualizer: true
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
        if (!configSettings.showVisualizer) return;
        
        const canvas = visualizerCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = window.innerWidth;
        const height = canvas.height = 60;
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, width, height);
        
        const barWidth = (width / dataArray.length) * 2;
        let barHeight;
        let x = 0;

        // 创建渐变色
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        const color = configSettings.lrcActiveColor || '#007aff';
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = (dataArray[i] / 255) * height;
            
            ctx.fillStyle = gradient;
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
        #js-mini-player {
            position: fixed; bottom: 50px; left: 0; 
            z-index: 2147483640; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            display: flex; align-items: center;
            background: rgba(255, 255, 255, 0.95); 
            backdrop-filter: blur(10px);
            padding: 10px;
            border-radius: 0 30px 30px 0;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            width: 300px; transform: translateX(0);
            border: 1px solid rgba(0,0,0,0.05);
            user-select: none;
            pointer-events: auto;
        }
        /* 隐藏状态：只露出封面的一小部分 */
        #js-mini-player.is-hidden {
            transform: translateX(-260px);
            cursor: pointer;
            opacity: 0.6;
        }
        #js-mini-player.is-hidden:hover {
            opacity: 1;
            transform: translateX(-250px);
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
        .p-info { flex: 1; overflow: hidden; }
        .p-title { font-size: 13px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-artist { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-controls { display: flex; gap: 6px; margin-left: 10px; }
        .p-btn { 
            cursor: pointer; background: #f5f5f7; width: 30px; height: 30px; 
            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
            font-size: 14px; transition: all 0.2s ease;
            color: #555;
        }
        .p-btn:hover { background: #007aff; color: #fff; transform: scale(1.1); }
        .p-btn:active { transform: scale(0.9); }
        
        /* 歌单列表样式 */
        #p-list-container {
            position: absolute; bottom: 100%; left: 0; width: 100%; 
            max-height: 0; background: rgba(255, 255, 255, 0.98); 
            backdrop-filter: blur(15px); border-radius: 15px 15px 0 0;
            overflow: hidden; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 -5px 15px rgba(0,0,0,0.05);
            border: 1px solid rgba(0,0,0,0.05);
            border-bottom: none;
        }
        #p-list-container.is-open {
            max-height: 250px;
            overflow-y: auto;
        }
        
        /* 设置面板样式 */
        #p-settings-panel {
            position: absolute; bottom: 100%; left: 0; width: 100%; 
            max-height: 0; background: rgba(255, 255, 255, 0.98); 
            backdrop-filter: blur(15px); border-radius: 15px 15px 0 0;
            overflow: hidden; transition: max-height 0.4s ease;
            box-shadow: 0 -5px 15px rgba(0,0,0,0.05);
            border: 1px solid rgba(0,0,0,0.05);
            z-index: 10;
        }
        #p-settings-panel.is-open {
            max-height: 300px;
            padding: 15px;
            overflow-y: auto;
        }
        .setting-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 13px; color: #555; }
        .setting-label { font-weight: 500; }
        .setting-ops { display: flex; gap: 5px; }
        .op-btn { 
            padding: 4px 8px; border-radius: 6px; background: #f0f0f2; 
            cursor: pointer; transition: 0.2s; font-size: 11px;
            display: flex; align-items: center; justify-content: center;
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
        .op-btn.is-active { background: #007aff; color: #fff; }
        
        /* 歌词展示 */
        #p-lrc-container {
            position: fixed; bottom: 20px; left: 0; right: 0;
            z-index: 2147483647; height: 40px; pointer-events: none; text-align: center;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s ease; opacity: 0;
        }
        #p-lrc-container.is-visible { opacity: 1; bottom: 25px; }
        #p-lrc-text {
            background: rgba(0, 0, 0, var(--lrc-opacity, 0.6)); 
            color: var(--lrc-color, #fff); 
            padding: 6px 20px;
            border-radius: 20px; font-size: 14px; backdrop-filter: blur(8px);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 85%; 
            box-shadow: 0 4px 12px rgba(0,0,0,calc(var(--lrc-opacity) * 0.3));
            border: 1px solid rgba(255,255,255,calc(var(--lrc-opacity) * 0.2));
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            transition: all 0.3s ease;
            position: relative;
        }
        #p-lrc-text::after {
            content: attr(data-text);
            position: absolute; left: 20px; top: 6px; 
            color: var(--lrc-active-color, #007aff);
            width: 0; overflow: hidden; white-space: nowrap;
            transition: width 0.3s linear;
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
            position: absolute; bottom: 0; left: 0; width: 100%; height: 4px;
            background: rgba(0,0,0,0.05); border-radius: 0 0 30px 0; 
            overflow: hidden; cursor: pointer; transition: height 0.2s;
        }
        .p-progress-container:hover {
            height: 8px;
        }
        #p-progress {
            height: 100%; width: 0%; background: #007aff; transition: width 0.1s linear;
        }

        /* 律动频谱样式 */
        #p-visualizer {
            position: fixed; bottom: 0; left: 0; width: 100%; height: 60px;
            z-index: 2147483645; pointer-events: none;
            transition: opacity 0.5s;
        }
    `;
    document.head.appendChild(style);
    // 3. 结构
    const container = document.createElement('div');
    container.id = 'js-mini-player';
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
                    <span class="op-btn is-active" data-color="#ffffff" style="background:#fff;border:1px solid #ddd"></span>
                    <span class="op-btn" data-color="#ffeb3b" style="background:#ffeb3b"></span>
                    <span class="op-btn" data-color="#4caf50" style="background:#4caf50"></span>
                    <span class="op-btn" data-color="#007aff" style="background:#007aff"></span>
                    <span class="op-btn" id="p-custom-color-btn" title="自定义颜色">
                        <input type="color" id="p-color-picker" value="#ffffff">
                    </span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">歌词高亮</span>
                <div class="setting-ops" id="p-lrc-active-color-ops">
                    <span class="op-btn is-active" data-color="#007aff" style="background: #007aff"></span>
                    <span class="op-btn" data-color="#ff2d55" style="background: #ff2d55"></span>
                    <span class="op-btn" data-color="#ffcc00" style="background: #ffcc00"></span>
                    <span class="op-btn" data-color="#4cd964" style="background: #4cd964"></span>
                    <span class="op-btn" id="p-active-custom-color-btn" style="background: linear-gradient(45deg, #f0f, #0ff); position: relative;">
                        <input type="color" id="p-active-color-picker" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                    </span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">律动频谱</span>
                <div class="setting-ops" id="p-visualizer-ops">
                    <span class="op-btn is-active" data-viz="on">开启</span>
                    <span class="op-btn" data-viz="off">关闭</span>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">背景透明</span>
                <input type="range" id="p-lrc-opacity-slider" class="p-slider" min="0" max="1" step="0.01" value="0.6">
                <span id="p-lrc-opacity-val" class="setting-value">60%</span>
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
    document.body.appendChild(container);

    const lrcContainer = document.createElement('div');
    lrcContainer.id = 'p-lrc-container';
    lrcContainer.innerHTML = '<div id="p-lrc-text"></div>';
    document.body.appendChild(lrcContainer);

    const visualizerCanvas = document.createElement('canvas');
    visualizerCanvas.id = 'p-visualizer';
    document.body.appendChild(visualizerCanvas);

    const playBtn = document.getElementById('p-play');
    const listToggle = document.getElementById('p-list-toggle');
    const listContainer = document.getElementById('p-list-container');
    const settingsToggle = document.getElementById('p-settings-toggle');
    const settingsPanel = document.getElementById('p-settings-panel');
    const lrcText = document.getElementById('p-lrc-text');
    const progressContainer = document.querySelector('.p-progress-container');
    const progressBar = document.getElementById('p-progress');
    
    // --- 核心逻辑：自动隐藏计时器 ---
    
    function startAutoHide() {
        if (listContainer.classList.contains('is-open') || settingsPanel.classList.contains('is-open')) return; // 列表或设置打开时不自动折叠
        clearTimeout(autoHideTimer);
        autoHideTimer = setTimeout(() => {
            container.classList.add('is-hidden');
        }, 1500);
    }
    function cancelAutoHide() {
        clearTimeout(autoHideTimer);
        container.classList.remove('is-hidden');
    }
    // 监听：鼠标进入播放器区域不隐藏，离开则开始倒计时
    container.addEventListener('mouseenter', cancelAutoHide);
    container.addEventListener('mouseleave', startAutoHide);
    
    // 监听：点击页面其他地方立即折叠
    document.addEventListener('click', (e) => {
        if (container && !container.contains(e.target) && e.target !== container) {
            container.classList.add('is-hidden');
            listContainer.classList.remove('is-open');
            settingsPanel.classList.remove('is-open');
        }
    });
    // 监听：点击播放器区域（包括按钮）都要取消自动隐藏并防止折叠
    container.addEventListener('click', (e) => {
        cancelAutoHide();
        // 如果点击的是内部按钮，不需要在这里 stopPropagation，按钮自己会处理
        // 但如果点击的是背景，需要 stopPropagation 防止触发 document 的点击逻辑
        if (e.target === container || e.target.id === 'p-cover' || e.target.classList.contains('p-info')) {
            e.stopPropagation();
        }
    }, true); 
    
    // 列表切换
    listToggle.onclick = (e) => {
        e.stopPropagation();
        settingsPanel.classList.remove('is-open');
        listContainer.classList.toggle('is-open');
    };

    // 设置切换
    settingsToggle.onclick = (e) => {
        e.stopPropagation();
        listContainer.classList.remove('is-open');
        settingsPanel.classList.toggle('is-open');
    };

    // 设置项点击
    document.getElementById('p-speed-ops').onclick = (e) => {
        if (e.target.dataset.speed) {
            configSettings.speed = parseFloat(e.target.dataset.speed);
            audio.playbackRate = configSettings.speed;
            updateOpsActive('p-speed-ops', 'speed', e.target.dataset.speed);
            saveSettings();
        }
    };
    document.getElementById('p-loop-ops').onclick = (e) => {
        if (e.target.dataset.mode) {
            configSettings.loop = e.target.dataset.mode;
            updateOpsActive('p-loop-ops', 'mode', e.target.dataset.mode);
            saveSettings();
        }
    };
    document.getElementById('p-lrc-ops').onclick = (e) => {
        if (e.target.dataset.lrc) {
            configSettings.showLrc = e.target.dataset.lrc === 'on';
            updateOpsActive('p-lrc-ops', 'lrc', e.target.dataset.lrc);
            if (!configSettings.showLrc) lrcContainer.classList.remove('is-visible');
            saveSettings();
        }
    };
    document.getElementById('p-lrc-color-ops').onclick = (e) => {
          if (e.target.dataset.color) {
              configSettings.lrcColor = e.target.dataset.color;
              document.documentElement.style.setProperty('--lrc-color', configSettings.lrcColor);
              updateOpsActive('p-lrc-color-ops', 'color', e.target.dataset.color);
              saveSettings();
          }
      };
      const colorPicker = document.getElementById('p-color-picker');
      colorPicker.oninput = (e) => {
          const color = e.target.value;
          configSettings.lrcColor = color;
          document.documentElement.style.setProperty('--lrc-color', color);
          // 取消其他预设颜色的激活状态，激活自定义按钮
          document.getElementById('p-lrc-color-ops').querySelectorAll('.op-btn').forEach(btn => {
              btn.classList.toggle('is-active', btn.id === 'p-custom-color-btn');
          });
          saveSettings();
      };
      colorPicker.onclick = (e) => e.stopPropagation(); // 防止触发父元素的 onclick
       
       const opacitySlider = document.getElementById('p-lrc-opacity-slider');
       const opacityVal = document.getElementById('p-lrc-opacity-val');
       opacitySlider.oninput = (e) => {
           const val = e.target.value;
           configSettings.lrcOpacity = val;
           document.documentElement.style.setProperty('--lrc-opacity', val);
           opacityVal.innerText = Math.round(val * 100) + '%';
           saveSettings();
       };
       opacitySlider.onclick = (e) => e.stopPropagation();

       // 高亮颜色设置
       document.getElementById('p-lrc-active-color-ops').onclick = (e) => {
           if (e.target.dataset.color) {
               configSettings.lrcActiveColor = e.target.dataset.color;
               document.documentElement.style.setProperty('--lrc-active-color', configSettings.lrcActiveColor);
               updateOpsActive('p-lrc-active-color-ops', 'color', e.target.dataset.color);
               saveSettings();
           }
       };
       const activeColorPicker = document.getElementById('p-active-color-picker');
       activeColorPicker.oninput = (e) => {
           const color = e.target.value;
           configSettings.lrcActiveColor = color;
           document.documentElement.style.setProperty('--lrc-active-color', color);
           document.getElementById('p-lrc-active-color-ops').querySelectorAll('.op-btn').forEach(btn => {
               btn.classList.toggle('is-active', btn.id === 'p-active-custom-color-btn');
           });
           saveSettings();
       };
       activeColorPicker.onclick = (e) => e.stopPropagation();

       document.getElementById('p-visualizer-ops').onclick = (e) => {
           if (e.target.dataset.viz) {
               configSettings.showVisualizer = e.target.dataset.viz === 'on';
               updateOpsActive('p-visualizer-ops', 'viz', e.target.dataset.viz);
               visualizerCanvas.style.opacity = configSettings.showVisualizer ? '1' : '0';
               saveSettings();
           }
       };

    function updateOpsActive(parentId, dataAttr, value) {
        document.getElementById(parentId).querySelectorAll('.op-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset[dataAttr] === value);
        });
    }

    // 进度条点击跳转
    progressContainer.onclick = (e) => {
        e.stopPropagation();
        if (audio.duration) {
            const rect = progressContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            const seekTime = (clickX / width) * audio.duration;
            audio.currentTime = seekTime;
        }
    };

    // --- 播放器功能 ---
    async function init() {
        // 应用保存的设置到 UI
        document.documentElement.style.setProperty('--lrc-color', configSettings.lrcColor);
        document.documentElement.style.setProperty('--lrc-active-color', configSettings.lrcActiveColor);
        document.documentElement.style.setProperty('--lrc-opacity', configSettings.lrcOpacity);
        
        const opacitySlider = document.getElementById('p-lrc-opacity-slider');
        const opacityVal = document.getElementById('p-lrc-opacity-val');
        opacitySlider.value = configSettings.lrcOpacity;
        opacityVal.innerText = Math.round(configSettings.lrcOpacity * 100) + '%';
        
        document.getElementById('p-color-picker').value = configSettings.lrcColor;
        document.getElementById('p-active-color-picker').value = configSettings.lrcActiveColor;
        
        updateOpsActive('p-speed-ops', 'speed', configSettings.speed.toFixed(1));
        updateOpsActive('p-loop-ops', 'mode', configSettings.loop);
        updateOpsActive('p-lrc-ops', 'lrc', configSettings.showLrc ? 'on' : 'off');
        updateOpsActive('p-visualizer-ops', 'viz', configSettings.showVisualizer ? 'on' : 'off');
        visualizerCanvas.style.opacity = configSettings.showVisualizer ? '1' : '0';

        // 如果是自定义颜色，激活自定义按钮
        const isPresetColor = Array.from(document.getElementById('p-lrc-color-ops').querySelectorAll('[data-color]'))
                                .some(el => el.dataset.color === configSettings.lrcColor);
        if (!isPresetColor) {
            document.getElementById('p-lrc-color-ops').querySelectorAll('.op-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.id === 'p-custom-color-btn');
            });
        } else {
            updateOpsActive('p-lrc-color-ops', 'color', configSettings.lrcColor);
        }

        // 高亮颜色同步
        const isPresetActiveColor = Array.from(document.getElementById('p-lrc-active-color-ops').querySelectorAll('[data-color]'))
                                .some(el => el.dataset.color === configSettings.lrcActiveColor);
        if (!isPresetActiveColor) {
            document.getElementById('p-lrc-active-color-ops').querySelectorAll('.op-btn').forEach(btn => {
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
                    startAutoHide(); 
                    return; 
                }
            } catch (e) {}
        }
        document.getElementById('p-title').innerText = "歌单加载失败";
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
        document.getElementById('p-title').innerText = track.title;
        document.getElementById('p-artist').innerText = track.author || '未知歌手';
        document.getElementById('p-cover').src = track.pic;
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
        // 优化正则：支持 [mm:ss.xx] 或 [mm:ss:xx] 或 [mm:ss]
        const pattern = /\[(\d{2}):(\d{2})[.:](\d{2,3})?\]/g;
        
        lines.forEach(line => {
            const pureText = line.replace(pattern, '').trim();
            if (!pureText) return;

            let res;
            // 重置正则的 lastIndex，确保每次 replace 后重新匹配时从头开始
            pattern.lastIndex = 0; 
            while ((res = pattern.exec(line)) !== null) {
                const min = parseInt(res[1]);
                const sec = parseInt(res[2]);
                const msStr = res[3] || '0';
                const ms = parseInt(msStr) / (msStr.length === 3 ? 1000 : 100);
                const time = min * 60 + sec + ms;
                lyrics.push({ time, text: pureText });
            }
        });
        lyrics.sort((a, b) => a.time - b.time);
    }

    function resetProgress() {
        progressBar.style.width = '0%';
        lrcContainer.classList.remove('is-visible');
    }

    audio.ontimeupdate = () => {
        if (audio.duration) {
            const pos = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = pos + '%';
            
            // 处理歌词
            if (configSettings.showLrc && lyrics.length) {
                const time = audio.currentTime;
                let index = -1;
                for (let i = 0; i < lyrics.length; i++) {
                    if (time >= lyrics[i].time) index = i;
                    else break;
                }
                
                if (index !== -1 && index !== currentLrcIndex) {
                    currentLrcIndex = index;
                    lrcText.innerText = lyrics[index].text;
                    lrcText.setAttribute('data-text', lyrics[index].text);
                    lrcContainer.classList.add('is-visible');
                }
            }
        }
    };
    audio.onplay = () => {
        document.getElementById('p-cover').classList.add('is-playing');
        playBtn.innerText = '⏸';
    };
    audio.onpause = () => {
        document.getElementById('p-cover').classList.remove('is-playing');
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
    document.getElementById('p-next').onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % playlist.length;
        load(currentIndex);
        audio.play().catch(() => {});
    };
    document.getElementById('p-prev').onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        load(currentIndex);
        audio.play().catch(() => {});
    };
    audio.onended = () => {
        if (configSettings.loop === 'one') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } else {
            document.getElementById('p-next').click();
        }
    };
    init();
})();