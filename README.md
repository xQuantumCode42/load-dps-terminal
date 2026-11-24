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

## 動手驗證：同一個終端機自動取得新的 PATH

這裡改用常見的靜態網站工具 [http-server](https://github.com/http-party/http-server)，只執行 `--version`，不啟動伺服器。
把它安裝到獨立的暫存目錄，測完就移除，不影響原本的全域套件或專案。

**為什麼不能只用 `npm install -g` 測試？** npm 的工具目錄若原本就在 PATH，普通終端機也能立即找到新套件。
下面刻意新增一個原本不存在於 PATH 的目錄，才能驗證刷新是否有效。
npm 不會替這個自訂目錄設定 Windows PATH，因此第 3 步會手動模擬安裝程式更新使用者 PATH。
這是 **Windows PowerShell 的 PATH 刷新驗證**，不是宣稱每次 npm 安裝都需要插件。

### 準備

先安裝 Windows 版 Node.js／npm，將預設終端機設為 **Load Dependency: Windows PowerShell**，再按 **`+`**。
用 **Load Dependency: Show Status** 確認目前終端機的 hook 是 `confirmed by shell readiness marker`。

**全程使用同一個 PowerShell 終端機。每個程式碼區塊分開執行，等提示字元再次出現才貼下一段。**
不要重開終端機、不要執行 `ld-refresh`，也不要手動設定 `$env:Path`。
此範例會暫時新增一筆「使用者 PATH」；最後的清理步驟會移除該筆設定。

### 1. 安裝到獨立目錄

```powershell
$ldDemoId = [guid]::NewGuid().ToString('N')
$ldDemoDir = Join-Path ([IO.Path]::GetTempPath()) "load-dependency-demo-$ldDemoId"
$ldDemoCommand = "ld-http-server-$ldDemoId.cmd"
npm.cmd install --global --prefix "$ldDemoDir" http-server
if ($LASTEXITCODE -ne 0) { throw '安裝失敗，請先檢查 npm 訊息。' }
Copy-Item -LiteralPath (Join-Path $ldDemoDir 'http-server.cmd') -Destination (Join-Path $ldDemoDir $ldDemoCommand)
```

額外複製一份帶隨機名稱的 npm 啟動檔，仍然執行剛裝好的 http-server。
這樣即使你原本已安裝 http-server，也不會誤測到舊版本。
`--prefix` 只影響這次安裝，不會更改 npm 的預設目錄。

### 2. 確認「已安裝，但還找不到」

```powershell
& (Join-Path $ldDemoDir $ldDemoCommand) --version
Get-Command $ldDemoCommand -ErrorAction SilentlyContinue
```

第一行用完整路徑應印出版本；第二行應**沒有輸出**，表示指令確實尚未進入搜尋路徑。
如果第一行失敗，先處理安裝問題，不要繼續測試。

### 3. 模擬安裝程式新增 PATH

```powershell
$ldDemoUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$ldDemoNewPath = if ([string]::IsNullOrEmpty($ldDemoUserPath)) { $ldDemoDir } else { "$ldDemoUserPath;$ldDemoDir" }
[Environment]::SetEnvironmentVariable('Path', $ldDemoNewPath, 'User')
```

這段只更新 Windows 儲存的使用者 PATH，沒有更新目前程序的 `$env:Path`。
**等新的提示字元出現後**，插件應自動讀取變更。

### 4. 在同一個終端機測試

```powershell
& $ldDemoCommand --version
(Get-Command $ldDemoCommand).Source
```

預期印出版本，以及剛才 `$ldDemoDir` 底下的啟動檔路徑。
Show Status 的刷新原因應包含 `persisted PATH changed`，時間對應第 3 步。

| 檢查點 | 預期結果 |
| --- | --- |
| 第 2 步：完整路徑執行 | 成功，證明套件已安裝 |
| 第 2 步：按名稱搜尋 | 找不到，證明目錄尚未在 PATH |
| 第 4 步：按名稱執行 | 成功，且來源是這次的暫存目錄 |

這組前後對照驗證了目前終端機有取得新的 PATH。
沒有刷新機制的既有 PowerShell 通常仍找不到該名稱；若有其他 PATH 刷新工具，也可能得到相同結果，因此請一併確認插件狀態與刷新紀錄。
若第 4 步失敗，先保留 Show Status 結果，再按下方「安裝完仍找不到指令」排查。

### 5. 還原 PATH、卸載並刪除暫存目錄

即使測試失敗，也請在**原本的終端機**執行清理。先驗證刪除目標確實是這次建立的暫存目錄：

```powershell
$ldDemoExpected = Join-Path ([IO.Path]::GetTempPath()) "load-dependency-demo-$ldDemoId"
if ($ldDemoId -notmatch '^[a-f0-9]{32}$' -or $ldDemoDir -ne $ldDemoExpected) { throw '暫存目錄無法確認，請勿繼續清理。' }
$ldDemoCurrentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$ldDemoRestoredPath = (($ldDemoCurrentPath -split ';') | Where-Object { $_ -ine $ldDemoDir }) -join ';'
if ($ldDemoRestoredPath -eq '') { $ldDemoRestoredPath = $null }
[Environment]::SetEnvironmentVariable('Path', $ldDemoRestoredPath, 'User')
npm.cmd uninstall --global --prefix "$ldDemoDir" http-server
Remove-Item -LiteralPath $ldDemoDir -Recurse -Force
```

清理只移除這次新增的 PATH 項目，保留其他現有項目，不會整份覆寫成測試前的舊值。
待提示字元再次出現，確認：

```powershell
Test-Path -LiteralPath $ldDemoDir
Get-Command $ldDemoCommand -ErrorAction SilentlyContinue
($env:Path -split ';') -contains $ldDemoDir
```

依序預期為 `False`、沒有輸出、`False`，表示工具檔案與目前終端機中的測試 PATH 都已移除。
若關閉了原本的終端機而遺失變數，請在 Windows「編輯帳戶的環境變數」中，只刪除這次 `load-dependency-demo-…` 的 PATH 項目，再移除對應的暫存資料夾。

安裝目錄規則見 [npm 官方文件](https://docs.npmjs.com/cli/v11/configuring-npm/folders/)，版本指令見 [http-server 官方說明](https://github.com/http-party/http-server)。

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
- 最近刷新時間與原因；PowerShell 的 `persisted PATH changed` 表示偵測到 Windows PATH 改變。

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

再試原本失敗的指令。若正在執行上面的驗證範例：

```powershell
& $ldDemoCommand --version
Get-Command $ldDemoCommand
```

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
