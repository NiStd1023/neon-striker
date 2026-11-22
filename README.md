# 霓虹雷擊 NEON STRIKER

原創 9:16 直向卷軸街機射擊遊戲，支援手機觸控、電腦鍵盤與滑鼠操作。

**[立即遊玩](https://nistd1023.github.io/neon-striker/)**

## 遊戲特色

- 三個空域與專屬頭目，主砲自動連射，拾取 P 升級火力、拾取 B 補充炸彈。
- 各關卡和頭目戰配有獨立的街機風格配樂。
- 可安裝為 PWA。首次連線並完成資源快取後，可離線遊玩。
- 最高分記錄於目前裝置的瀏覽器中。

## 操作方式

| 功能 | 電腦 | 手機 |
| --- | --- | --- |
| 移動 | 方向鍵、WASD 或滑鼠拖曳 | 按住畫面拖曳 |
| 炸彈 | 空白鍵 | 右下角閃電按鈕 |
| 暫停 | P 或 Esc | 右上角暫停按鈕 |

## 安裝

在 Android 的 Chrome 或電腦版 Chrome／Edge 中，使用瀏覽器選單的「安裝應用程式」或「加到主畫面」。在 iPhone／iPad 的 Safari 中，使用「分享」選單的「加入主畫面」。

## 本機開發

本專案使用原生 HTML、CSS 與 JavaScript，不需安裝套件或建置。以本機 HTTP 伺服器啟動：

```sh
python3 -m http.server 8000
```

接著開啟 `http://localhost:8000/`。Service Worker 需要 localhost 或 HTTPS，直接以檔案方式開啟無法啟用離線快取。

## 目錄

- `index.html`、`style.css`、`app.js`：遊戲介面和操作。
- `engine.js`、`draw.js`：遊戲規則與畫面繪製。
- `sound.js`、`music.js`、`assets/music/`：音效、配樂播放器及遊戲配樂。
- `manifest.webmanifest`、`service-worker.js`、`pwa.js`：PWA 安裝與離線功能。
- `music/`：配樂音符編排與音軌產生程式。

## 部署與更新

GitHub Pages 由 `main` 分支的根目錄發布。將變更提交並推送到 `main` 後，GitHub Pages 會自動重新部署。

離線快取的資源清單位於 `service-worker.js`。新增、刪除或改名遊戲資源時，請同步更新清單，並在每次發布時遞增 `CACHE` 的版本名稱。使用者關閉所有遊戲分頁後，新版 Service Worker 才會啟用，避免遊戲中途混用不同版本的資源。

圖示字型 Noto Sans CJK TC 的授權說明位於 `assets/FONT-LICENSE.txt`。
