# 當鋪排班表

這是一個可部署到 Vercel 的動態前端排班工具。資料目前儲存在瀏覽器 localStorage，不需要資料庫。

## 功能

- 獨立新增人員
- 人員可指定 A、B、C 三組
- 人員可停用、啟用、刪除
- 每天獨立產生排班
- 每人一小時
- 12 小時分成三組，每組 4 小時
- 每個時段只會從該組人員中抽選
- 最新加入前 3 名人員有較高排班權重
- 組內人員足夠時，同一天盡量不重複
- 可建立範例人員
- 可複製當日排班文字
- 可下載當日排班 CSV
- 可清除當日排班或全部資料

## 預設組別

- A組：09:00～13:00
- B組：13:00～17:00
- C組：17:00～21:00

## 狀態機

系統使用簡單狀態機控制流程。

- Idle：等待操作
- ManagingPeople：新增、停用、啟用、刪除人員
- GeneratingSchedule：產生排班
- ViewingSchedule：顯示排班
- Error：顯示錯誤訊息

## 部署到 Vercel

1. 到 Vercel 新增專案。
2. 匯入此 GitHub repository。
3. Framework Preset 選 Other。
4. Build Command 可留空。
5. Output Directory 可留空。
6. Deploy。

## 檔案

- `index.html`：頁面結構
- `styles.css`：介面樣式
- `app.js`：狀態機、排班演算法與資料儲存
- `vercel.json`：Vercel 路由設定
- `package.json`：專案資訊
