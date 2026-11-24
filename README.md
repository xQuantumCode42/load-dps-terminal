# Load Dependency

安裝命令列工具後，讓目前終端機找到新指令，減少關閉重開 VS Code 的需要。
當安裝程式新增 Windows PATH 後，不用重開終端機，就能在下一個提示字元使用新工具。
本插件更新指令搜尋路徑，不會替你安裝套件，也不會自動啟動工具。

**目前是 0.1.0 本機試用版。插件完成啟用後，按 VS Code 終端機的 `+` 就會載入刷新功能，不必每次另外執行 Open Terminal。**

## 第一次使用

1. 按 `Ctrl+Shift+X` 開啟 VS Code 擴充套件頁面。
2. 點右上角 `…` → **Install from VSIX…**（從 VSIX 安裝），選擇 `load-dependency-0.1.0.vsix`。
3. 如畫面要求，執行 **Restart Extensions**。
4. 插件會檢查目前的預設終端機設定；`LD: setting up` 是短暫畫面，沒有看到它不一定是異常。
5. 直接按 VS Code 終端機的 **`+`** 開新終端機。狀態會先顯示 `loading`，收到 shell 的啟用確認後變成 `LD: powershell`、`LD: cmd` 或 `LD: wsl`，並出現 `[Load Dependency]` 訊息。

若原本已開著普通終端機，設定完成後會顯示 **`LD: unhooked`**，意思是「目前舊視窗未載入鉤子」，請直接按 `+` 開新的。
**`LD: + ready` 只在沒有選中的終端機、且新終端機預設已配置好時出現；不必等待這個特定文字才能按 `+`。**

自動設定開啟時，每次插件啟用都會依照目前的設定確認狀態；先前的初始化紀錄不代表現在已啟用。
如果你手動改回支援的原生預設 shell，下次插件啟用時會再對應成同類型的 Load Dependency 設定檔。
若希望長期使用不帶鉤子的原生預設，請關閉 `loadDependency.autoDefaultTerminal`；還原操作會保留最近一次的原生選擇。
標準 PowerShell、CMD、預設 WSL 會盡量沿用原先的 shell，並保留原預設設定供還原。
如果原本是帶特殊參數或環境變數的自訂 shell，會保留它並提示選擇支援的設定檔。
指定發行版的 Ubuntu 設定檔也會保留，避免誤切到另一個 WSL 發行版；內建的 Ubuntu / WSL 選項使用系統預設發行版。
此時執行一次 **Load Dependency: Set Default Terminal**，選好後，往後一樣直接按 `+`。

若更新舊版試用檔，請重新安裝新的 VSIX，關閉舊終端機，再按 `+` 開新的。
舊終端機仍使用啟動當時的腳本，重新安裝插件不會替換它的 shell 鉤子；不需因此退出整個 VS Code。

## 一鍵驗證（Windows PowerShell）

按 **`+`** 開啟 Load Dependency 的 Windows PowerShell 終端機，確認 Windows 版 Node.js／npm 已安裝。
在本專案根目錄 `tools/load-dependency/` 執行：

```powershell
& .\verify.ps1
```

如果你目前位於 playground 根目錄，則執行：

```powershell
& .\tools\load-dependency\verify.ps1
```

腳本會自動完成：

1. 將 [http-server](https://github.com/http-party/http-server) 安裝到獨立暫存目錄，只查版本，不啟動伺服器。
2. 建立唯一名稱的啟動檔，確認完整路徑能執行、按名稱仍找不到，避免誤測已存在的全域套件。
3. 暫時將該目錄加入 Windows 使用者 PATH，返回目前終端機的正常提示字元，讓插件自行刷新。
4. 按名稱執行新指令並核對來源，顯示 **`[PASS]`** 或 **`[FAIL]`**。
5. 自動卸載測試套件、移除新增的 PATH 項目與暫存目錄，顯示 **`[CLEAN]`**。

不需要重開終端機或執行 `ld-refresh`。清理會保留其他 PATH 項目與測試期間其他程式新增的項目。
若看到 `[CLEANUP FAILED]`，請依畫面列出的路徑手動移除該筆使用者 PATH 與暫存資料夾。
執行期間請讓腳本完成；若強制關閉終端機或 VS Code，無法保證清理，啟動時印出的暫存路徑可供手動還原。

**請在既有的互動式 PowerShell 直接執行上述指令。** 不要用 `powershell.exe -File`、雙擊或另開子程序，驗證需要原終端機的下一次提示字元。
若本機執行原則阻擋腳本，可先在同一個終端機執行 `Set-ExecutionPolicy -Scope Process Bypass`，只影響本次 PowerShell；受組織政策管理的環境請遵循其規範。

選用 `.ps1` 是因為 `.sh` 會在 Bash／WSL 執行，無法驗證目前 Windows PowerShell 的 PATH 刷新。
此腳本只驗證 Windows PowerShell；CMD、WSL 的刷新能力需另外測試。

**這個例子驗證什麼？** 單純 `npm install -g` 可能把工具放進原本就存在於 PATH 的目錄，沒有插件也能用。
腳本使用新的獨立目錄，手動模擬安裝程式更新使用者 PATH，才能對照刷新前後的差異；它不會手動呼叫 `ld-refresh` 或先改程序 PATH 來製造成功結果。
清理階段才移除程序 PATH 裡的測試項目。若另有 PATH 刷新工具，也可能通過，請搭配 **Show Status** 確認插件載入與刷新紀錄。

安裝目錄規則見 [npm 官方文件](https://docs.npmjs.com/cli/v11/configuring-npm/folders/)。

## 怎麼確認有沒有啟用？

| 狀態列 | 代表什麼 |
| --- | --- |
| `LD: setting up` | 正在設定，可能只短暫出現 |
| `LD: + ready` | 新終端機預設已配置好，目前沒有選中的終端機 |
| `LD: unhooked` | 目前選中的是舊／普通終端機，請按 `+` 開新的 |
| `LD: cmd loading` 等 | 正在等 shell 回報已載入，尚不能當作啟用成功 |
| `LD: powershell`／`LD: cmd`／`LD: wsl` | 已收到該 shell 的刷新確認 |
| `LD: not enabled` | 目前預設並非插件設定檔，需要查看狀態或選擇支援的預設 shell |
| `LD: ... error` | 啟動超過 15 秒仍未收到 shell 確認，請查看狀態 |
| `LD: off`／`LD: refresh off` | 自動設定或刷新功能已關閉 |

執行 **Load Dependency: Show Status**，確認以下資訊：

- 建置標記是 `2026-11-24-initialization-fix`，表示已載入這次修正版。
- `LD profile active: yes` 表示新的 `+` 終端機預設已配置。
- `Active terminal hook: confirmed by shell readiness marker` 才表示目前選中的終端機已真正載入。
- 最近刷新時間與原因；PowerShell 的 `path-change`（狀態畫面可能顯示 `persisted PATH changed`）表示偵測到 Windows PATH 改變。

**單純「新套件能執行」不足以證明刷新生效。** 請用上面的獨立目錄測試，核對搜尋結果、來源路徑與刷新紀錄。
若完全看不到狀態列，請先確認 VS Code 的「檢視 → 外觀 → 狀態列」已開啟。

## 需要每次用 Open Terminal 嗎？

不需要。一般的 `+` 使用預設終端機設定檔；自動設定開啟時，插件啟用會把支援的原生預設 shell 對應到 Load Dependency 設定檔。
若要改用 CMD、PowerShell 7 或 Ubuntu / WSL，執行一次 **Set Default Terminal** 後再按 `+`。
也可以透過 VS Code 的 **Terminal: Select Default Profile** 選擇 `Load Dependency: ...` 設定檔。

手動從下拉選單選擇未帶 Load Dependency 的原生設定檔，仍會開出未載入鉤子的 shell。
插件安裝前就開啟的舊終端機也不會被強制改動；請開一個新的。

本版會備份並更新 VS Code 的預設終端機設定，不會修改 PowerShell profile、`.bashrc` 或 Windows 登錄。

## 停用與還原

執行 **Load Dependency: Restore Previous Default Terminal**，即可還原插件保存的預設設定，並關閉自動設定。
也可以在設定中關閉 `loadDependency.autoDefaultTerminal`。
使用者後來手動修改的預設選擇會保留，既有終端機不會被關閉。
停用或解除安裝整個插件前，建議先執行還原；要再次啟用，執行 **Set Default Terminal**。

## 安裝完仍找不到指令

先確認安裝程式已結束，且安裝位置與目前終端機相同（Windows 或 WSL）。
然後在同一個終端機輸入一次：

```text
ld-refresh
```

再試原本失敗的工具指令。若一鍵驗證顯示失敗，請先保留 Show Status 結果；驗證腳本會自動移除測試套件，要重測請重新執行 `& .\verify.ps1`。

| 結果 | 意義與下一步 |
| --- | --- |
| 手動刷新後就成功 | 自動刷新可能漏掉，請回報安裝指令與 Show Status；手動刷新是復原方式，不是正常流程多做的一步 |
| `ld-refresh` 本身也找不到 | shell 尚未載入插件，或你在終端機內又開了另一層 shell |
| 手動刷新仍失敗 | 工具可能未安裝成功、未把目錄加入 PATH，或需要自己的 activation 指令 |

PowerShell 會在返回提示字元時檢查 Windows PATH 是否改變，因此可涵蓋自訂安裝腳本，不限於 `npm install` 等指令名稱。
WSL 不會自動執行安裝器新增的任意啟動腳本；nvm、conda、自訂目錄仍可能需要工具自己的啟用步驟。

## 其他操作與範圍

| 操作 | 用途 |
| --- | --- |
| 按終端機的 **`+`** | 日常開啟已載入鉤子的預設終端機 |
| **Set Default Terminal** | 選擇以後按 `+` 使用的 shell |
| **Restore Previous Default Terminal** | 還原原預設並停用自動設定 |
| **Open Terminal** | 可選的額外入口，不是使用插件的必要步驟 |
| 終端機內輸入 `ld-refresh` | 立即手動刷新目前 shell |
| **Request PATH Refresh** | 排入請求，等 shell 下一次處理；不等於立即執行 `ld-refresh` |
| **Show Status** | 查看啟用狀態、刷新時間與原因 |
| **Restart Extensions** | 手動重啟擴充套件，與 CLI 安裝分開處理 |

已實測 Windows PowerShell 5.1、CMD、Ubuntu WSL 的 Bash；PowerShell 7 已有適配，尚待實機驗證。
CMD 的自動鉤子針對支援的套件管理器；完整路徑、批次檔、複合命令不保證自動刷新。
WSL 使用預設發行版；遠端 WSL／SSH 專案視窗不在本版範圍。
插件不會把新環境即時同步到所有終端機，也不會讓已執行的其他程式全部無感更新。

## 回報問題

請提供 shell 名稱、完整安裝指令、失敗指令、手動刷新後是否恢復，以及 **Show Status** 的結果。
不需提供 API key 或登入憑證。

開發與測試資訊另放在原始專案的 `docs/development.md`；使用插件不需安裝開發依賴或執行測試。
