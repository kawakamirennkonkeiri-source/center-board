/**
 * センター連携GAS（3つのスプレッドシート → 電子黒板）
 * ㈱カワカミ蓮根 センターDX
 *
 *  発注書「進捗」   → ?type=nizukuri → 本日荷造り
 *  力量表「力量表」  → ?type=haichi   → 配置図
 *  シフト「R◯年◯月」→ ?type=shift    → シフト・配置図（出勤者）
 *
 * すべて JSONP（?callback=xxx）で返すので、電子黒板(file://)から直接読めます。
 *
 * ▼ 使う前に：下の SS_ID 3つに、各スプレッドシートのURLの
 *   /d/ と /edit の間の長い英数字（＝スプレッドシートID）を貼る。
 *   例: https://docs.google.com/spreadsheets/d/【ここがID】/edit
 */

// ===== 設定（ここだけ書き換える） =====
var CFG = {
  // 発注書（本日荷造り）
  ORDER_SS_ID:  '1TcTuKuIJ-haTZasoKxiVQMUZRHt4_z2-mWvH9VLEBqQ',
  ORDER_SHEET:  '進捗',

  // 本日の舟数は、発注書「発注書」シートの“この見出しの列”から取る（取引先が増えて列がズレても見出しで探す）。
  //   列を固定(DH等)にすると取引先追加でズレるため、見出し名で列を自動検出する。名前を変えたらここを直す。
  ORDER_FUNES_HEADER: '収穫舟数',

  // ② 本日荷造りの「荷造数（作った分）」を書き込む“テスト用”生産ログ（力量表SS内・自動作成）。
  //    ★荷造数は「作った日（生産日）」ごとに1行。進捗シート側は各日の行で数式集計する。
  //    ※本番の発注書「進捗」シートには一切書き込みません（既存データは絶対に触らない）。
  //    ※実際に黒板が書き込んでいるシート名に合わせる（今は「本日荷造り進捗(テスト)」）。
  NZ_TEST_SHEET: '本日荷造り進捗(テスト)',
  // ② 力量表内の“テスト用進捗シート”の名前（荷造数の自動反映機能は廃止済み。シート自体の参照が残る箇所向けに設定は保持）
  PROGRESS_TEST_SHEET: '進捗（テスト）',

  // 力量表（配置図）
  SKILL_SS_ID:  '1D0DPqy1chAdcBFyIczYtAJx7CJMTlevhlfxlO0HINGo',
  SKILL_SHEET:  '力量表',
  PRIO_SHEET:   '配置優先',   // ① 配置図の11工程ごとの優先番号を数字で管理する専用シート（力量表SS内。力量表〈○×〉とは別に持つ）

  // 電子黒板・資材アプリの状態/バックアップ専用スプレッドシート（2026-09-03新設）。
  //   ★以前はここに並ぶ全部が「力量表」スプレッドシートに間借りしていて分かりにくかったため分離。
  //   力量表SSに残すのは「力量表」（力量○×の本体）と「配置優先」（力量表と一体で使う優先番号）だけ。
  //   それ以外（本日荷造り状態・配置設定・実績・圃場舟数・生産者記録・荷造りスナップショット・
  //   ポジション履歴・本日荷造り進捗(テスト)・資材データ/資材バックアップ/月末棚卸（実数））は全部こちらへ。
  BOARD_DATA_SS_ID: '1j55dNG7RkrytEPhvbCfMi0Y9W5beKH0xBp7YuC0OAic',   // 【センターDX】電子黒板データ保管庫
  POSITION_SHEET: 'ポジション履歴',   // 配置図の保存先シート（力量表と同じスプレッドシート内。無ければ自動作成）
  JISSEKI_SHEET:  '実績',            // 本日実績シート（力量表と同じスプレッドシート内。列＝日付/荷造り舟数/荷造りkg/歩留まり(%)）
  HOJO_SHEET:     '圃場舟数',        // ⑥ 圃場（畑）から持ってきた舟数の記録（力量表SS内。列＝日付/圃場/舟数/更新日時）
  SEISAN_SHEET:   '生産者記録',      // ⑥ 生産者の持ち込み舟数・出来高（力量表SS内。列＝日付/時間帯/生産者/区分/サイズkg/舟数/出来高kg/更新日時。実績数量には含めない）

  // ⑩ センターTODOマスタ（2026-09-08 新設）：BOARD_DATA_SS_ID内の一覧シート（A=業務/B=頻度・1行目見出し）を
  //   電子黒板が読んで表示。チェック操作は「TODO履歴」シートへ1行追記するだけ（状態はここに持たず履歴から都度組み立てる）。
  TODO_MASTER_SHEET: 'センターTODOマスタ',
  TODO_LOG_SHEET:    'TODO履歴',

  // ⑪ Googleカレンダー連携（2026-09-10 新設）：このカレンダーの当日予定のうち、タイトルにキーワードを
  //   含むものだけTODOカードへ自動追加（例「センター包丁研ぎチェック」→「包丁研ぎチェック」）。
  TODO_CALENDAR_ID:      'kawakamirennkonkeiri@gmail.com',
  TODO_CALENDAR_KEYWORD: 'センター',

  // ⑥ 生産DX（朝礼ボード）＝今日活動する圃場名の“マスタ”。毎朝ここから圃場（畑）タブへ自動反映する。
  //   生産のスプレッドシート（A列＝本日の日付／B列＝圃場名）を、生産DXのWebアプリが読んで返す。
  //   返却例：{"ok":true,"date":"2026/8/13","fields":[{"field":"共和7-⑥",...},...]}
  //   ★別のGASに差し替えたい時だけ、このURL（?action=todayfields まで含む）を貼り替える。
  SEISAN_DX_URL: 'https://script.google.com/macros/s/AKfycbxsG4rPn7OlPcXiEJHeW-ysvsxhU7jXVh6KOHjzoi6BG44KTvamIhMw-Mqiu1ohsSbz/exec?action=todayfields',
  NZ_SNAP_SHEET:  '荷造りスナップショット', // ③ 発注書の前回値スナップショット（NEW判定用。力量表SS内。列＝キー/舟数/変更検知日時）
  HAICHI_CFG_SHEET: '配置設定',      // ① 配置図のゾーン設定（枠数/優先度）・優先番号・手動配置を全PCで共有（力量表SS内・JSON1件）
  NZ_STATE_SHEET: '本日荷造り状態',   // ③ 本日荷造りの状態(未確定/確定/作成済)・作った分・前日修正を全PCで共有（力量表SS内・JSON1件）

  // ⑤ 配置図の画像保存先（Googleドライブ）。空欄なら「配置図画像」という名前のフォルダを（無ければ）自動作成して使う。
  //   ★特定のフォルダに保存したいとき＝そのフォルダをブラウザで開いたURL
  //     （例 https://drive.google.com/drive/folders/1AbC…XyZ ）の「folders/」の後ろの英数字だけを ''内に貼る。
  //     例）HAICHI_IMG_FOLDER_ID: '1AbC23dEfGhIjKlMnOpQrStUvWxYz',
  HAICHI_IMG_FOLDER_ID: '10GALP-O30lz3iaeKdBV95KjzfRd_2bPp',   // 曽我さん指定フォルダ（2026-08-11）
  HAICHI_IMG_FOLDER_NAME: '配置図画像',
  NZ_NEW_MS: 12*60*60*1000,   // ③ NEW表示を続ける時間（検知から12時間）

  // シフト（シフト・配置図の出勤者）
  //   ★「【センター】2026年度シフト（シフト管理アプリ）」＝シフト管理アプリv2の書き込み先。
  SHIFT_SS_ID:  '1Nk-18McLyVXqTOCiaPn5aOaWYVjionyQLJ0NFWqvynU',
  // シフトの月シート名は today から自動生成（例: 2026-08 → R8年8月）
  //   ・センター（現場）の在籍者は「センター合計人数」行より上のロスター。ここに居て力量表に無い人は
  //     getShift_ が力量表へ自動追加（registerNewWorkers_）＝新しい人が自動で力量表に載る。
  SKILL_AUTO_REGISTER: true,   // シフトのセンター在籍者を力量表に自動登録するか

  // ⑦ 手袋（シフト連動）＝資材管理アプリの「ビニール手袋S/M/L」の使用枚数をシフトから自動計算する。
  //   ・センター1人あたり1日 GLOVE_PER_PERSON 枚 使う前提。
  //   ・各人の手袋サイズは月シートの「サイズ列」に氏名ごと1回だけ書いてある（S/M/L 等）。
  //     2026-08-18〜 曽我さんがサイズ列を C列 → **A列** へ移動（氏名＝B列・日付＝C列以降のまま）。
  //     GLOVE_SIZE_COL が空なら自動検出（見出しに「手袋」「サイズ」がある列 → 無ければ S/M/L が並ぶ列）。
  //     列を動かしたら、ここの文字（'A' 'B' 'C' …）を書き換えるだけでよい。
  //   ・その日のセルが「休」以外（〇・時間指定・午後休など）＝出勤1人としてカウントする。
  GLOVE_PER_PERSON: 8,
  GLOVE_SIZE_COL: 'A',         // サイズ列＝A列（空にすると自動検出）

  // 資材管理アプリ（クラウド共有）。アプリのデータ一式をこのシートに保存し、全PCで共有する。
  //   空欄のままなら BOARD_DATA_SS_ID（電子黒板データ保管庫）内に「資材データ」シートを自動作成して使う（2026-09-03〜）。
  SHIZAI_SS_ID: '',           // 別のスプレッドシートに保存したい時だけIDを入れる（空＝BOARD_DATA_SS_IDを使う）
  SHIZAI_SHEET: '資材データ',
  SHIZAI_BACKUP_SHEET: '資材バックアップ',   // 月末棚卸ごとの世代バックアップ（追記のみ・上書きしない＝復元用のJSON）
  SHIZAI_STOCK_SHEET: '月末棚卸（実数）',    // 人が読める実数の表（A列=資材／月ごとに列が増えるピボット）

  TZ: 'Asia/Tokyo',
  MARK_PRESENT: '〇',   // 出勤マーク（U+3007。○(U+25CB)ではない）

  // 進捗シートの取引先名が空欄/古いところの上書き表。「表示された名前|入数」→ 正しい名前
  //   例）本日「丸勘」と出るのは実は大地を守る会、「ｵﾈｽﾄ」はサポーレ
  NAME_OVERRIDE: {
    '丸勘|5':  '大地を守る会',
    'ｵﾈｽﾄ|5':  'サポーレ'
  },

  // 本日荷造りに出さない出荷グループ（部分一致）。例：個人＋サンプル（Mup）
  HIDE_GROUPS: ['個人＋サンプル'],

  // 区分が見つからないときの既定（空にすれば無表示）。例：洗い
  DEFAULT_BUNRUI: '洗い'
};

// ============================================================
// 入口：?type=... & ?callback=... で分岐（JSONP）
// ============================================================
function doGet(e){
  e = e || { parameter:{} };
  var type = e.parameter.type || '';
  var out;
  try{
    if(type === 'shift')         out = getShift_(e.parameter);   // &date=YYYY-MM-DD で「その日」のシフト（🔮配置図（予測）用。省略＝今日）
    else if(type === 'haichi')   out = getHaichi_();
    else if(type === 'nizukuri') out = getNizukuri_(e.parameter);
    else if(type === 'debugColors') out = debugColors_(e.parameter);   // ⑤ 発注書の数字の文字色→状態の判定（診断用・読み取りのみ）
    else if(type === 'nizukuriSave') out = saveNizukuri_(e.parameter);   // ② 本日荷造りの前日/本日入力→テスト用進捗シートへ記録（力量表SS・既存シートは触らない）
    else if(type === 'nizukuriProgress') out = getNizukuriProgress_(e.parameter); // ② テスト用進捗シートの保存済み値を返す（前日/本日の復元用）
    else if(type === 'savePosition') out = savePosition_(e.parameter);   // 配置図→ポジション履歴に保存（書き込み）
    else if(type === 'summary')  out = getSummary_(e.parameter);         // 本日の舟数(発注書「収穫舟数」列・見出しで検出)＋実績(力量表「実績」シート)
    else if(type === 'hojoGet')  out = hojoGet_(e.parameter);            // ⑥ 圃場（畑）舟数：指定日の記録を返す
    else if(type === 'seisanGet') out = seisanGet_(e.parameter);         // ⑥ 生産者：指定日の持ち込み舟数・出来高を返す
    else if(type === 'haichiCfgGet') out = getHaichiCfg_();               // ① 配置図の設定（ゾーン/優先番号/手動配置）をクラウドから読む＝全PC共有
    else if(type === 'nizukuriStateGet') out = getNizukuriState_();       // ③ 本日荷造りの状態・作った分をクラウドから読む＝全PC共有
    else if(type === 'bundle')   out = getBundle_(e.parameter);          // ★ まとめ取得：黒板の30秒ポーリング用に主要データを1回で返す（呼び出し回数を約1/8に）
    else if(type === 'shizaiUsage') out = getShizaiUsage_(e.parameter);  // 資材管理アプリ：期間内の各SKU(取引先×区分×入数)の荷造数合計
    else if(type === 'shizaiLoad') out = getShizaiState_();               // 資材管理アプリ：クラウド共有データを読む（全データ）
    else if(type === 'shizaiMeta') out = getShizaiMeta_();                // 資材管理アプリ：更新情報だけ（rev/savedAt）＝ポーリング用に軽い
    else if(type === 'shizaiBackupList') out = getShizaiBackupList_();    // 資材管理アプリ：月末バックアップの一覧（月・保存日時・PC・サイズ）
    else if(type === 'shizaiBackupGet')  out = getShizaiBackup_(e.parameter); // 資材管理アプリ：指定月のバックアップ本体（&month=YYYY-MM）
    else if(type === 'sendHelp') out = sendHelp_(e.parameter);            // ③ センターヘルプ要請をSlackへ中継（WebhookはHTMLに置かずここで保持）
    else if(type === 'sendSlack') out = sendHelp_(e.parameter);           // ⑧ 汎用Slack投稿（繁忙期の資材再確認報告など）。中身は sendHelp_ と同じ中継。
    else if(type === 'gloveUsage') out = getGloveUsage_(e.parameter);     // ⑦ 手袋：シフトの出勤者数×1人あたり枚数を日別・サイズ別に返す
    else if(type === 'todoMaster') out = getTodoBoard_(e.parameter.date); // ⑩ センターTODOマスタ一覧＋本日（or指定日）のチェック状態
    else if(type === 'debug')    out = debugTop_();     // 構造確認用
    else out = { error:'type を shift / haichi / nizukuri / nizukuriStateGet / savePosition / summary / hojoGet / seisanGet / haichiCfgGet / gloveUsage / todoMaster / shizaiUsage / shizaiLoad / shizaiMeta / shizaiBackupList / shizaiBackupGet のいずれかで指定してください' };
  }catch(err){
    out = { error: String(err && err.message || err) };
  }
  var body = JSON.stringify(out);
  if(e.parameter.callback){
    return ContentService.createTextOutput(e.parameter.callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 入口（書き込み）：資材管理アプリのデータ保存（POST）
//   本文(JSON)＝ { action:'shizaiSave', json:'<S全体のJSON>', rev:<基準リビジョン>, by:'<PC名>', force:true? }
//   返却＝ { ok, rev, savedAt } / 競合時 { ok:false, conflict:true, rev }
//   ※file:// から fetch(POST, text/plain) で呼べる（プリフライト無しの単純リクエスト）
// ============================================================
function doPost(e){
  var out;
  try{
    var body = {};
    try{ body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }catch(_){ body = {}; }
    var action = body.action || (e && e.parameter && e.parameter.action) || '';
    if(action === 'shizaiSave') out = saveShizaiState_(body);
    else if(action === 'shizaiBackupSave') out = saveShizaiBackup_(body);   // 月末バックアップを1行追記（上書きしない）
    else if(action === 'savePositionImg') out = savePositionImg_(body);     // ⑤ 配置図の画像をGoogleドライブに保存
    else if(action === 'hojoSave') out = hojoSave_(body);                   // ⑥ 圃場（畑）舟数：指定日の記録を保存（upsert）
    else if(action === 'seisanSave') out = seisanSave_(body);               // ⑥ 生産者：指定日の持ち込み舟数・出来高を保存（upsert）
    else if(action === 'haichiCfgSave') out = saveHaichiCfg_(body);          // ① 配置図の設定（ゾーン/優先番号/手動配置）をクラウドへ保存＝全PC共有
    else if(action === 'nizukuriStateSave') out = saveNizukuriState_(body);   // ③ 本日荷造りの状態・作った分をクラウドへ保存（サーバ側マージ）＝全PC共有
    else if(action === 'todoLog') out = todoLogAppend_(body);                // ⑩ センターTODOのチェック/解除を履歴へ1行追記
    else out = { ok:false, error:'unknown action: ' + action };
  }catch(err){
    out = { ok:false, error:String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ③ センターヘルプ要請 → Slack へ中継
//   電子黒板(HTML)には Webhook URL を持たせない（GitHub公開でも漏れないように）。
//   Webhook URL は「プロジェクトの設定 ▶ スクリプト プロパティ」に
//   キー HELP_WEBHOOK = https://hooks.slack.com/services/XXX/YYY/ZZZ を登録して使う。
//   呼び出し：?type=sendHelp&msg=<本文>&callback=<JSONP関数名>
// ============================================================
function sendHelp_(p){
  var url = PropertiesService.getScriptProperties().getProperty('HELP_WEBHOOK') || '';
  if(!url) return { ok:false, error:'HELP_WEBHOOK 未設定（スクリプトプロパティに登録してください）' };
  var msg = String((p && p.msg) || '').trim();
  if(!msg) return { ok:false, error:'メッセージが空です' };
  try{
    var res = UrlFetchApp.fetch(url, {
      method:'post',
      contentType:'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: msg }),
      muteHttpExceptions:true
    });
    var code = res.getResponseCode();
    if(code >= 200 && code < 300) return { ok:true };
    return { ok:false, error:'Slack応答 ' + code };
  }catch(err){
    return { ok:false, error:String(err && err.message || err) };
  }
}
// エディタから▶実行して、スクリプトプロパティのWebhookでSlackへテスト投稿できるか確認
function testSendHelp(){ Logger.log(JSON.stringify(sendHelp_({ msg:'🆘 テスト：センターヘルプ要請の疎通確認' }), null, 2)); }

// ============================================================
// 資材管理アプリ：クラウド共有ストレージ（1シートにデータ一式を保存）
//   レイアウト（「資材データ」シート）：
//     B1=rev（更新のたび+1） / B2=savedAt / B3=savedBy(PC名) / B4=chunks（分割数）
//     A5〜 ＝ JSON文字列を45000字ごとに分割して縦に格納（セルは最大約5万字のため）
// ============================================================
function shizaiSheet_(){
  var id = CFG.SHIZAI_SS_ID || CFG.BOARD_DATA_SS_ID;
  var ss = SpreadsheetApp.openById(id);
  var name = CFG.SHIZAI_SHEET || '資材データ';
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange('A1').setValue('rev');     sh.getRange('B1').setValue(0);
    sh.getRange('A2').setValue('savedAt'); sh.getRange('B2').setValue('');
    sh.getRange('A3').setValue('savedBy'); sh.getRange('B3').setValue('');
    sh.getRange('A4').setValue('chunks');  sh.getRange('B4').setValue(0);
  }
  return sh;
}
// 更新情報だけ（軽い。ポーリング用）
function getShizaiMeta_(){
  var sh = shizaiSheet_();
  return {
    rev:     Number(sh.getRange('B1').getValue()) || 0,
    savedAt: String(sh.getRange('B2').getValue() || ''),
    savedBy: String(sh.getRange('B3').getValue() || '')
  };
}
// データ一式（JSON文字列を連結して返す）
function getShizaiState_(){
  var sh = shizaiSheet_();
  var rev    = Number(sh.getRange('B1').getValue()) || 0;
  var chunks = Number(sh.getRange('B4').getValue()) || 0;
  var json = '';
  if(chunks > 0){
    var vals = sh.getRange(5, 1, chunks, 1).getValues();
    for(var i = 0; i < vals.length; i++) json += String(vals[i][0] || '');
  }
  return {
    rev: rev,
    savedAt: String(sh.getRange('B2').getValue() || ''),
    savedBy: String(sh.getRange('B3').getValue() || ''),
    json: json
  };
}
// 保存（リビジョン照合＋ロックで上書き事故を防ぐ）
function saveShizaiState_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh  = shizaiSheet_();
    var cur = Number(sh.getRange('B1').getValue()) || 0;
    var base = Number(body.rev);
    // 基準rev（＝読み込んだ時のrev）が現在のrevと違う＝他PCが先に更新済み。force指定が無ければ競合として返す
    if(!body.force && !isNaN(base) && base !== cur){
      return { ok:false, conflict:true, rev:cur, savedBy:String(sh.getRange('B3').getValue()||''), savedAt:String(sh.getRange('B2').getValue()||'') };
    }
    var json = String(body.json || '');
    // 既存のチャンク行をクリア
    var oldChunks = Number(sh.getRange('B4').getValue()) || 0;
    if(oldChunks > 0) sh.getRange(5, 1, oldChunks, 1).clearContent();
    // 45000字ごとに分割
    var size = 45000, parts = [];
    for(var i = 0; i < json.length; i += size) parts.push(json.substr(i, size));
    if(parts.length === 0) parts = [''];
    var newRev = cur + 1;
    var now = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    sh.getRange('B1').setValue(newRev);
    sh.getRange('B2').setValue(now);
    sh.getRange('B3').setValue(String(body.by || ''));
    sh.getRange('B4').setValue(parts.length);
    var out = []; for(var j = 0; j < parts.length; j++) out.push([parts[j]]);
    sh.getRange(5, 1, parts.length, 1).setValues(out);
    return { ok:true, rev:newRev, savedAt:now };
  } finally {
    lock.releaseLock();
  }
}
// エディタから▶実行して現在の保存状況（rev/savedAt/savedBy）を確認
function testShizaiState(){ Logger.log(JSON.stringify(getShizaiMeta_(), null, 2)); }

// ============================================================
// 資材管理アプリ：月末バックアップ（世代保存・追記のみ＝上書きしない）
//   月末棚卸を確定するたびに1行追記。データが壊れても任意の月に戻せる。
//   「資材バックアップ」シートのレイアウト（1行＝1バックアップ）：
//     A=対象月(YYYY-MM) / B=保存日時 / C=保存PC名 / D=文字数 / E=分割数 / F〜=JSON（45000字ごと）
//   ※同じ月を複数回確定した場合も上書きせず追記。一覧/復元は「その月の最新行」を使う。
// ============================================================
function shizaiBackupSheet_(){
  var id = CFG.SHIZAI_SS_ID || CFG.BOARD_DATA_SS_ID;
  var ss = SpreadsheetApp.openById(id);
  var name = CFG.SHIZAI_BACKUP_SHEET || '資材バックアップ';
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.appendRow(['対象月', '保存日時', '保存PC', '文字数', '分割数', 'JSON→']);
  }
  return sh;
}
// 追記保存（POST：action=shizaiBackupSave, month, savedAt, by, json）
function saveShizaiBackup_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh = shizaiBackupSheet_();
    var json    = String(body.json || '');
    var month   = String(body.month || '');
    var savedAt = String(body.savedAt || '') || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    var by      = String(body.by || body.savedBy || '');
    // 45000字ごとに分割（1セル最大約5万字のため）
    var size = 45000, parts = [];
    for(var i = 0; i < json.length; i += size) parts.push(json.substr(i, size));
    if(parts.length === 0) parts = [''];
    var row = [month, savedAt, by, json.length, parts.length].concat(parts);
    sh.appendRow(row);
    sortSheetDescByHeader_(sh, '保存日時');   // 2026-09-03：常に保存日時の新しい順（降順）で並べ直す
    // 人が読める「実数」の表も更新（失敗しても復元用JSONは守る）。列見出し＝棚卸日（無ければ月）
    var colLabel = String(body.date || '') || month;
    try{ writeStocktakeTable_(colLabel, body.stock); }catch(e){}
    return { ok:true, month:month, savedAt:savedAt, rows:sh.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}
// 月末棚卸（実数）を見やすい表として保存：A列=資材／B列=単位／棚卸ごとに列が右に増える。
//   列見出し＝棚卸を確認した日（YYYY-MM-DD）。同じ日を再確定したらその列を上書き。新しい資材は行を自動追加。
//   ※古い月見出し（YYYY-MM）の列も残る（混在OK）。
function writeStocktakeTable_(colLabel, stock){
  colLabel = String(colLabel || '');
  if(!colLabel || !stock) return;
  var rows = (typeof stock === 'string') ? JSON.parse(stock) : stock;   // POSTでは配列 or JSON文字列
  if(!rows || !rows.length) return;
  var id = CFG.SHIZAI_SS_ID || CFG.BOARD_DATA_SS_ID;
  var ss = SpreadsheetApp.openById(id);
  var name = CFG.SHIZAI_STOCK_SHEET || '月末棚卸（実数）';
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(['資材', '単位']); }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  // ① その棚卸日（or 月）の列を探す（無ければ右端に新規作成）
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = -1;
  for(var c = 2; c < header.length; c++){ if(headerNorm_(header[c], colLabel) === colLabel){ col = c + 1; break; } }
  if(col < 0){ col = lastCol + 1; sh.getRange(1, col).setNumberFormat('@').setValue(colLabel); }   // 文字列固定（日付に化けるのを防ぐ）
  // ② 資材名→行 の対応（A列・2行目以降）
  var names = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  var rowOf = {};
  for(var i = 0; i < names.length; i++){ var nm = String(names[i][0] || ''); if(nm) rowOf[nm] = i + 2; }
  // ③ 実数を書き込む（新資材は行追加）
  var nextRow = (lastRow > 1 ? lastRow : 1) + 1;
  for(var k = 0; k < rows.length; k++){
    var r = rows[k]; var nm = String(r.name || ''); if(!nm) continue;
    var rr = rowOf[nm];
    if(!rr){ rr = nextRow++; sh.getRange(rr, 1).setValue(nm); sh.getRange(rr, 2).setValue(r.unit || ''); rowOf[nm] = rr; }
    var cell = sh.getRange(rr, col);
    cell.setValue(r.actual);
    cell.setNote(r.reason ? ('理由：' + r.reason) : '');   // 破棄率が多い時に書いた理由をセルのメモとして残す
  }
}
// 見出しセル（文字列 or 日付に化けたもの）を、ラベルと同じ粒度（日 or 月）で正規化して比較に使う
function headerNorm_(x, label){
  if(x instanceof Date){
    var isDate = (String(label || '').length > 7);   // "YYYY-MM-DD"(=10) か "YYYY-MM"(=7) か
    return Utilities.formatDate(x, CFG.TZ, isDate ? 'yyyy-MM-dd' : 'yyyy-MM');
  }
  return String(x || '').trim();
}
// （旧）月見出し正規化。互換のため残置
function headerToMonth_(x){
  if(x instanceof Date) return Utilities.formatDate(x, CFG.TZ, 'yyyy-MM');
  return String(x || '').trim();
}
// 一覧（月ごとに最新1件だけ・新しい月が上）。本体JSONは含めず軽く返す
function getShizaiBackupList_(){
  var sh = shizaiBackupSheet_();
  var last = sh.getLastRow();
  if(last < 2) return { list: [] };
  var vals = sh.getRange(2, 1, last - 1, 5).getValues();   // A〜E（月/日時/PC/文字数/分割数）
  var map = {};
  for(var i = 0; i < vals.length; i++){
    var m = String(vals[i][0] || ''); if(!m) continue;
    map[m] = { month:m, savedAt:String(vals[i][1]||''), savedBy:String(vals[i][2]||''), size:Number(vals[i][3])||0, row:i+2 };
    // 後の行ほど新しい＝同月は最新で上書き
  }
  var list = Object.keys(map).map(function(k){ return map[k]; });
  list.sort(function(a,b){ return a.month < b.month ? 1 : (a.month > b.month ? -1 : 0); });
  return { list: list };
}
// 指定月のバックアップ本体（その月の最新行）を返す（&month=YYYY-MM）
function getShizaiBackup_(params){
  var month = String((params && params.month) || '');
  if(!month) return { error:'month を指定してください' };
  var sh = shizaiBackupSheet_();
  var last = sh.getLastRow();
  if(last < 2) return { error:'バックアップがありません' };
  var months = sh.getRange(2, 1, last - 1, 1).getValues();
  var target = -1;
  for(var i = 0; i < months.length; i++){ if(String(months[i][0]||'') === month) target = i + 2; } // 最後にマッチ＝最新
  if(target < 0) return { error:'その月のバックアップが見つかりません' };
  var chunks = Number(sh.getRange(target, 5).getValue()) || 0;
  var json = '';
  if(chunks > 0){
    var cv = sh.getRange(target, 6, 1, chunks).getValues()[0];
    for(var j = 0; j < cv.length; j++) json += String(cv[j] || '');
  }
  return {
    month: month,
    savedAt: String(sh.getRange(target, 2).getValue() || ''),
    savedBy: String(sh.getRange(target, 3).getValue() || ''),
    json: json
  };
}
// エディタから▶実行して一覧を確認
function testShizaiBackup(){ Logger.log(JSON.stringify(getShizaiBackupList_(), null, 2)); }

// ============================================================
// 本日サマリ：本日舟数（発注書「発注書」の“収穫舟数”列・見出しで検出・今日の行）＋実績（力量表「実績」シート・今日の行）
//   ?type=summary → { date, targetFunes, jisseki:{funes,kg,budomari} }
//   ※targetFunes＝発注書の「収穫舟数」列の今日の値（列位置は固定せず見出しで探す＝取引先が増えてもズレない）
// ============================================================
function getSummary_(params){
  var today = params && params.date ? parseParamDate_(params.date) : new Date();
  var out = { date: Utilities.formatDate(today, CFG.TZ, 'yyyy-MM-dd'), targetFunes: null, jisseki: { funes:null, kg:null, budomari:null }, orderTotalKg: null, orderKawakamiKg: null, orderBudomari: null, orderCsRate: null, orderKawakamiCsKg: null };
  try{ out.targetFunes = readOrderFunes_(today); }catch(e){ out.targetError = String(e); }
  try{ out.jisseki = readJisseki_(today); }catch(e){ out.jissekiError = String(e); }
  try{
    var prog = readOrderProgressRow_(today);
    out.orderTotalKg    = prog.totalKg;
    out.orderKawakamiKg = prog.kawakamiKg;
    out.orderBudomari   = prog.budomari;
    out.orderCsRate     = prog.csRate;   // ② 発注書「進捗」シートのCS率（参考値・比較表示専用。読み取り専用）
  }catch(e){ out.orderTotalKgError = String(e); }
  try{ out.orderProgressByClient = readOrderProgressByClient_(today); }catch(e){ out.orderProgressByClientError = String(e); }
  // 2026-09-03：荷造りCS㎏を「カワカミ荷造数」欄から自動計算（曽我さん依頼。読み取り専用）
  try{ out.orderKawakamiCsKg = readKawakamiCsKg_(today); }catch(e){ out.orderKawakamiCsKgError = String(e); }
  return out;
}
// 発注書メインシートの「収穫舟数」列（見出しで自動検出）× 日付(B列)が今日の行の値。
//   ・列は固定しない：取引先が増えて列がズレても、見出し名（CFG.ORDER_FUNES_HEADER＝既定「収穫舟数」）で列を探す。
//   ・見出しは改行・空白があってもOK（除去して部分一致で判定）。上から15行を走査。
function readOrderFunes_(today){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  if(!sh) return null;
  var v = sh.getDataRange().getValues();
  var want = String(CFG.ORDER_FUNES_HEADER || '収穫舟数').replace(/\s|　/g,'');

  // ① 「収穫舟数」の見出しがある列を探す
  var col = -1;
  for(var r=0; r<Math.min(v.length,15) && col<0; r++){
    for(var c=0; c<v[r].length; c++){
      if(String(v[r][c]==null?'':v[r][c]).replace(/\s|　/g,'').indexOf(want) >= 0){ col = c; break; }
    }
  }
  if(col < 0) return null;   // 見出しが見つからない（名前が変わったら CFG.ORDER_FUNES_HEADER を直す）

  // ② 今日の行（B列＝日付）を探して、その列の値を返す
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  for(var r2=0; r2<v.length; r2++){
    var b = v[r2][1]; // B列
    if(b instanceof Date && Utilities.formatDate(b, CFG.TZ, 'yyyy/M/d') === todayStr){
      var val = v[r2][col];
      var n = (typeof val === 'number') ? val : Number(String(val).replace(/[^0-9.\-]/g,''));
      return isNaN(n) ? null : n;
    }
  }
  return null;
}
// 発注書「進捗」シートの「合計kg数」「カワカミ荷造数」「歩留まり」列（見出しで自動検出・列固定しない）
//   × A列が今日の行の値。
//   ★ 電子黒板の「荷造りkg（実績）」＝カワカミ荷造数、「歩留まり」＝歩留まり と突き合わせて
//      一致確認するための値（合計kg数は生産者ぶんも含むため一致確認には使わない・参考値として残す）。
//   ・列は固定しない：新規取引先が増えて列がズレても、まず「合計kg数」の見出し文字（全角㎏表記・空白ゆれを吸収）で
//     列を探す（上から10行を走査）。
//   ・カワカミ荷造数／歩留まりは「合計kg数」の2列右／4列右という相対位置で取る
//     （合計kg数｜生産者｜カワカミ荷造数｜舟数｜歩留まり｜CS率…の並び固定）。
//     ★「カワカミ荷造数」という文字列だけで独立に列を探すと、シートの別の場所（無関係な列）にたまたま
//       同じ文字列があった場合にそちらを拾ってしまい、値が常に0/空になる不具合が2026-08-31に発生したため、
//       信頼できる「合計kg数」列を基準にした相対位置での取得に変更した。
//   ・日付はA列（Date型）。テキスト形式で入っていた場合は拾えないので、その時はA列の書式を確認する。
function readOrderProgressRow_(today){
  var out = { totalKg:null, kawakamiKg:null, budomari:null, csRate:null };
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET);
  if(!sh) return out;
  var v = sh.getDataRange().getValues();

  // ① 「合計kg数」の見出しがある列を探す（見出し文字の完全一致・空白/全角㎏ゆれは吸収）
  var colTotal=-1;
  for(var r=0; r<Math.min(v.length,10) && colTotal<0; r++){
    for(var c=0; c<v[r].length; c++){
      var t = String(v[r][c]==null?'':v[r][c]).replace(/\s|　/g,'').replace(/㎏/g,'kg');
      if(t==='合計kg数'){ colTotal = c; break; }
    }
  }
  if(colTotal<0) return out;   // 見出しが見つからない（列名が変わったらここを直す）
  var colKawakami = colTotal + 2;   // 合計kg数｜生産者｜カワカミ荷造数
  var colBud      = colTotal + 4;   // 合計kg数｜生産者｜カワカミ荷造数｜舟数｜歩留まり
  var colCsRate   = colTotal + 5;   // 合計kg数｜生産者｜カワカミ荷造数｜舟数｜歩留まり｜CS率
  //   ★2026-09-03調査：このCS率は「カワカミ荷造数」欄（ケース単位で手入力する専用の集計列）だけを見ており、
  //     右側に並ぶ取引先ごとのC/S欄（阪食・小田商店・帯役ワタリ…等）は含まれない。また列の作りとして
  //     C側は(件数×5kg)+(件数×10kg)ときちんと重み付けされているのに対しS側は件数のまま(×10kgされていない)
  //     ため、S側の寄与が本来より小さく出る＝発注書側の式自体に集計範囲/単位のズレがある可能性が高い。
  //     電子黒板の「加工率」は全取引先の当日注文のうち区分がC/Sの物をkgで自動集計した別の計算のため、
  //     元々一致しない値である旨を、この値を表示する側（電子黒板）で必ず併記すること。発注書側は編集しない。

  // ② 今日の行（A列＝日付）を探して、各列の値を返す
  //    ※空欄セルはNumber('')が0になってしまうため、明示的にnullで返す（0扱いにすると「確認中」であるべき
  //      状態が誤って「差0kgあり」等に化けてしまうため）。
  function num_(val){ if(val===''||val==null) return null; var n=(typeof val==='number')?val:Number(String(val).replace(/[^0-9.\-]/g,'')); return isNaN(n)?null:n; }
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  for(var r2=0; r2<v.length; r2++){
    var a = v[r2][0]; // A列
    if(a instanceof Date && Utilities.formatDate(a, CFG.TZ, 'yyyy/M/d') === todayStr){
      if(colTotal>=0)    out.totalKg    = num_(v[r2][colTotal]);
      if(colKawakami>=0) out.kawakamiKg = num_(v[r2][colKawakami]);
      if(colBud>=0)      out.budomari   = num_(v[r2][colBud]);
      if(colCsRate>=0)   out.csRate     = num_(v[r2][colCsRate]);
      break;
    }
  }
  return out;
}
// 🔍 進捗差分（取引先ごと）用：発注書「進捗」シートの5行目「荷造数」列を取引先ごとに合算して返す（読み取り専用）。
//   ・4行目＝取引先名（結合セル運用のため空欄は左の値を引き継ぐ）／5行目＝見出しに「荷造数」を含む列を検出。
//   ・区分・入数違いの列がまたがっていても、取引先名だけをキーに本日ぶんを合算する（単位＝c/s、金額換算しない）。
//   ・列は固定しない（見出し文字で検出）。発注書スプレッドシートへは書き込まない。
function readOrderProgressByClient_(today){
  var out = {};
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET);
  if(!sh) return out;
  var v = sh.getDataRange().getValues();

  // ① 取引先名の行（4行目）＝A列に西暦が入っている行
  var custRow = -1;
  for(var r=0; r<Math.min(v.length,15); r++){ var y=Number(v[r][0]); if(y>=2000 && y<=2100){ custRow=r; break; } }
  if(custRow<0) return out;
  var subRow = custRow + 1;   // 5行目＝「荷造数」見出し
  if(subRow>=v.length) return out;

  // ② 今日の行（A列＝日付）を探す
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  var todayRow = -1;
  for(var r2=subRow+1; r2<v.length; r2++){
    var d = v[r2][0];
    if(d instanceof Date && Utilities.formatDate(d, CFG.TZ, 'yyyy/M/d') === todayStr){ todayRow = r2; break; }
  }
  if(todayRow<0) return out;

  // ③ 「荷造数」列を見出しで検出し、1列左の取引先名（空欄は直前の名前を引き継ぐ）で合算
  var lastName = '';
  for(var c=1; c<v[subRow].length; c++){
    var head = String(v[subRow][c]==null?'':v[subRow][c]).replace(/\s|　/g,'');
    if(head.indexOf('荷造数') < 0) continue;
    var nm = String(v[custRow][c-1]==null?'':v[custRow][c-1]).replace(/\n/g,' ').trim();
    if(nm) lastName = nm;
    var name = lastName;
    if(!name) continue;
    var raw = v[todayRow][c];
    var n = (typeof raw === 'number') ? raw : Number(String(raw||'').replace(/[^0-9.\-]/g,''));
    if(!(n > 0)) continue;
    out[name] = (out[name] || 0) + n;
  }
  return out;
}
// 🔍 電子黒板の「荷造りCS㎏」用：発注書「進捗」シートの「カワカミ荷造数」欄（結合セル・C/S×重さ別の内訳）から
//   本日ぶんの実際のCS kgを計算して返す（読み取り専用）。曽我さん依頼＝今まで黒板側の手入力（本日荷造りの
//   カード入力の積み上げ）に頼っていたCSキロを、進捗シート側の数字に合わせて自動反映する。
//   ・「カワカミ荷造数」の見出しセル（結合セル。実例＝GK3:GM3）を上から10行走査して探す（列は固定しない）。
//   ・その1行下＝区分（C/C/S等）、2行下＝重さ（5kg/10kg/10kg等）。
//   ・区分×重さの各列について「本日の行の値（件数）×重さ」を合計＝これが実際のCS kg
//     （CS率調査で判明した式 C率=(C5kg数×5+C10kg数×10)/(...) と同じ考え方。ここではCS率ではなくkgそのものを返す）。
//   ★2026-09-03の初回実装バグ＝「区分が空になったらブロック終了」としていたが、実際は「カワカミ荷造数」の
//     すぐ右に「阪食」「小田商店」等の別の取引先ブロックが（空列を挟まず）続けて並んでおり、それぞれにも
//     区分「C」があるため、隣の取引先の列まで巻き込んで合計してしまっていた（実測400kgのはずが1900kgに）。
//     → ブロックの終わりは「区分の有無」ではなく「見出し行(headRow)に次の取引先名が現れたか」で判定するよう修正
//     （結合セルなので見出し行はブロックの先頭列だけ値があり、それ以外は空欄になる仕組みを利用）。
function readKawakamiCsKg_(today){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET);
  if(!sh) return null;
  var v = sh.getDataRange().getValues();

  // ①「カワカミ荷造数」の見出しセルを探す（結合セルなので値は先頭列だけに入っている）
  var headRow=-1, startCol=-1;
  for(var r=0; r<Math.min(v.length,10) && headRow<0; r++){
    for(var c=0; c<v[r].length; c++){
      var t = String(v[r][c]==null?'':v[r][c]).replace(/\s|　/g,'');
      if(t==='カワカミ荷造数'){ headRow=r; startCol=c; break; }
    }
  }
  if(headRow<0) return null;   // 見出しが見つからない（名前が変わったらここを直す）
  var kubunRow = headRow+1, weightRow = headRow+2;
  if(weightRow>=v.length) return null;

  // ② 見出し行(headRow)に次の取引先名が現れるまでを「カワカミ荷造数」ブロックとみなして列を集める
  //   （結合セルの仕組み上、ブロック内はstartCol以外headRowが空欄になる）。重さは「5kg」等の文字列も数値だけ取り出す。
  var cols = [];
  for(var c2=startCol; c2<v[kubunRow].length; c2++){
    if(c2>startCol && String(v[headRow][c2]==null?'':v[headRow][c2]).trim()!==''){ break; }   // 次のブロック（別の取引先）が始まった
    var kubun = String(v[kubunRow][c2]==null?'':v[kubunRow][c2]).trim();
    if(!kubun) continue;   // この列だけ区分が無い＝スキップ（ブロックはheadRowの境界まで続ける）
    var wRaw = v[weightRow][c2];
    var w = (typeof wRaw==='number') ? wRaw : Number(String(wRaw||'').replace(/[^0-9.]/g,''));
    if(w>0) cols.push({ c:c2, w:w });
  }
  if(!cols.length) return null;

  // ③ 今日の行（A列＝日付）を探して、各列（件数）×重さ の合計を返す
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  var row=-1;
  for(var r2=headRow; r2<v.length; r2++){
    var a=v[r2][0];
    if(a instanceof Date && Utilities.formatDate(a, CFG.TZ, 'yyyy/M/d')===todayStr){ row=r2; break; }
  }
  if(row<0) return null;
  var kg=0;
  cols.forEach(function(x){
    var raw = v[row][x.c];
    var n = (typeof raw==='number') ? raw : Number(String(raw||'').replace(/[^0-9.\-]/g,''));
    if(n>0) kg += n * x.w;
  });
  return Math.round(kg*10)/10;
}
// ★診断専用（読み取りのみ・発注書スプレッドシートは一切変更しない）：
//   「進捗」シートの合計㎏数セルの数式 SUMPRODUCT(($C$5:$GG$5="荷造数")*N($B$5:$GF$5)*N(C128:GG128)) が
//   荷造りkg（実績）と合わない原因調査用。エディタでこの関数を選んで▶実行→「表示」→「実行数」（または
//   「ログ」）でログを確認し、その内容をそのまま貼ってください。
function debugOrderProgressFormula(){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET);
  if(!sh){ Logger.log('シートが見つかりません: ' + CFG.ORDER_SHEET); return; }
  var todayStr = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy/M/d');

  // ① A列から「今日」の行番号を探す（式は row128 に固定されているが、今日が本当に128行目か確認する）
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var aCol = sh.getRange(1, 1, lastRow, 1).getValues();
  var todayRow = -1;
  for (var i = 0; i < aCol.length; i++) {
    var a = aCol[i][0];
    if (a instanceof Date && Utilities.formatDate(a, CFG.TZ, 'yyyy/M/d') === todayStr) { todayRow = i + 1; break; }
  }
  Logger.log('今日(' + todayStr + ')の行 = ' + todayRow + '　※数式は128行目に固定なので、ここが128以外なら日付ズレが原因');

  // ② 見出し行（5行目）を1列ずつ見て、「荷造数」列ごとに
  //    「1つ左のセル（重さ）」「今日の値セル」がSheetsのN()と同じ基準（＝本当に数値型かどうか。
  //    見た目が"5"でも文字列として書き込まれていればN()は0扱いになる＝過去に電子黒板でも起きた不具合）で読めるか確認する。
  //    ※ JSのNumber("5")は5に変換できてしまいこの不具合を再現できないため、あえてtypeof==='number'で厳密判定する。
  var header5 = sh.getRange(5, 1, 1, lastCol).getValues()[0];
  var todayVals = todayRow > 0 ? sh.getRange(todayRow, 1, 1, lastCol).getValues()[0] : null;
  var sum = 0, bad = [];
  var lines = [];
  for (var c = 2; c < lastCol; c++) { // c=2 → C列（0-index）
    var headTxt = String(header5[c] == null ? '' : header5[c]).replace(/\s|　/g, '');
    if (headTxt !== '荷造数') continue;
    var weightCell = header5[c - 1];                 // 1列左＝重さラベル（例:「2kg」）
    var weightIsNum = (typeof weightCell === 'number');   // N()と同じ基準：数値型でなければ0扱い
    var cnt = todayVals ? todayVals[c] : null;
    var cntIsNum = (typeof cnt === 'number');
    var w = weightIsNum ? weightCell : 0;
    var cntNum = cntIsNum ? cnt : 0;
    var contrib = w * cntNum;
    sum += contrib;
    var colLetter = columnToLetter_(c + 1), leftLetter = columnToLetter_(c);
    lines.push(colLetter + '列(見出し' + leftLetter + '5="' + weightCell + '"[' + (typeof weightCell) + ']→N()=' + w
      + ') × 本日値"' + cnt + '"[' + (typeof cnt) + ']→N()=' + cntNum + ' = ' + contrib);
    if (!weightIsNum && weightCell !== '' && weightCell != null) bad.push(leftLetter + '5="' + weightCell + '"（型=' + (typeof weightCell) + '・数値型でないためN()で0扱い）');
    if (!cntIsNum && cnt !== '' && cnt != null) bad.push(colLetter + (todayRow) + '="' + cnt + '"（型=' + (typeof cnt) + '・数値型でないためN()で0扱い＝文字列として書き込まれている可能性）');
  }
  Logger.log('列ごとの内訳:\n' + lines.join('\n'));
  if (bad.length) Logger.log('★N()で0扱いになっているセル（ここが原因の可能性が高い）:\n' + bad.join('\n'));
  Logger.log('N()の挙動に厳密にそろえて自前で再計算したSUMPRODUCT = ' + sum);

  // ③ シート上の実際の「合計kg数」「カワカミ荷造数」「歩留まり」セルの値（数式の計算結果そのもの）を見る。
  //    ★見出しは5行目とは限らない（「荷造数」の重さラベルとは別の行にある）ので、readOrderProgressRow_と
  //      同じやり方で上から10行を走査して見出しの位置を探す。
  var head10 = sh.getRange(1, 1, Math.min(10, lastRow), lastCol).getValues();
  var colTotal = -1, colKawakami = -1, colBud = -1, labelRow = -1;
  for (var rr = 0; rr < head10.length; rr++) {
    for (var cc = 0; cc < head10[rr].length; cc++) {
      var tt = String(head10[rr][cc] == null ? '' : head10[rr][cc]).replace(/\s|　/g, '').replace(/㎏/g, 'kg');
      if (colTotal < 0    && tt === '合計kg数')      { colTotal = cc;    labelRow = rr + 1; }
      if (colKawakami < 0 && tt === 'カワカミ荷造数') { colKawakami = cc; labelRow = rr + 1; }
      if (colBud < 0      && tt === '歩留まり')       { colBud = cc;      labelRow = rr + 1; }
    }
  }
  Logger.log('「合計kg数」等の見出しが見つかった行 = ' + labelRow + '（列インデックス: 合計kg数=' + colTotal + ' カワカミ荷造数=' + colKawakami + ' 歩留まり=' + colBud + '）');
  if (todayVals) {
    if (colTotal >= 0)    Logger.log('今日の行の「合計kg数」セル値(実際の数式結果)　= ' + todayVals[colTotal] + '　←自前で再計算した値(' + sum + ')と比べてください');
    if (colKawakami >= 0) Logger.log('今日の行の「カワカミ荷造数」セル値 = ' + todayVals[colKawakami]);
    if (colBud >= 0)      Logger.log('今日の行の「歩留まり」セル値 = ' + todayVals[colBud]);
  }

  // ④ 「カワカミ荷造数」が空だった原因調査（読み取りのみ）：今日の行と前の行で、実際に何が入っているか
  //    （数式が入っていない／数式はあるが前の行までしかコピーされていない、等）を比べる。
  if (colKawakami >= 0 && todayRow > 1) {
    var kCellNow  = sh.getRange(todayRow, colKawakami + 1);
    var kCellPrev = sh.getRange(todayRow - 1, colKawakami + 1);
    Logger.log('カワカミ荷造数：今日(' + todayRow + '行目)のセル = "' + kCellNow.getFormula() + '"（数式が空欄なら未入力・未コピー）'
      + ' / 値=' + JSON.stringify(kCellNow.getValue()));
    Logger.log('カワカミ荷造数：前日(' + (todayRow - 1) + '行目)のセル = "' + kCellPrev.getFormula() + '"'
      + ' / 値=' + JSON.stringify(kCellPrev.getValue()));
  }
}
// ★一時調査用（読み取りのみ）：個人注文／その他サンプルの実際のサブ列構成（Mup/S/C/新芽等）を確認する。
//   曽我さんの依頼「Mup・SとC・新芽を分けて表示」に対応するため、まず実際のシートの列構成を見る。
function debugKgGroups(){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  var v = sh.getDataRange().getValues();
  var nameRow = -1;
  for(var r = 0; r < Math.min(v.length, 15); r++){ var y = Number(v[r][1]); if(y>=2000&&y<=2100){ nameRow=r; break; } }
  var nyusuRow = nameRow + 2, kubunLeft = nameRow + 1, kubunRight = nameRow - 3;
  var todayStr = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy/M/d');
  var dateCol = 1, best = -1;
  for(var c0 = 0; c0 < 6; c0++){ var cnt=0; for(var rr=nameRow+3; rr<v.length; rr++){ if(v[rr][c0] instanceof Date) cnt++; } if(cnt>best){ best=cnt; dateCol=c0; } }
  var todayRow = -1;
  for(var r2=nameRow+3; r2<v.length; r2++){ var d=v[r2][dateCol]; if(d instanceof Date && Utilities.formatDate(d, CFG.TZ,'yyyy/M/d')===todayStr){ todayRow=r2; break; } }
  var lastName = '', lines = [];
  for(var c = 2; c < v[nameRow].length; c++){
    var nm = String(v[nameRow][c] || '').replace(/\n/g,' ').trim();
    if(nm) lastName = nm;
    if(!/個人注文|その他サンプル/.test(lastName)) continue;
    var nyusu = v[nyusuRow][c];
    var flag8 = String(v[kubunLeft][c] || '').trim();
    var flag4 = String(v[kubunRight][c] || '').trim();
    var todayVal = todayRow>=0 ? v[todayRow][c] : null;
    lines.push(columnToLetter_(c+1) + '列: name="' + nm + '"(継承後="' + lastName + '") 4行目="' + flag4 + '" 8行目="' + flag8 + '" 9行目(入数)="' + nyusu + '"[' + (typeof nyusu) + '] 本日値=' + JSON.stringify(todayVal));
  }
  Logger.log('nameRow=' + (nameRow+1) + ' todayRow=' + (todayRow+1) + '\n' + lines.join('\n'));
  return lines;
}
function columnToLetter_(col) {
  var s = '';
  while (col > 0) { var m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = Math.floor((col - 1) / 26); }
  return s;
}
// 2026-09-03：ログ形式のシート（1行=1件の記録）を、指定した見出し列で新しい順（降順）に並べ替える共通関数。
//   ・見出し文字で列を探す（列位置がシートによって違ってもそのまま使える）。
//   ・ヘッダー行(1行目)はそのまま・2行目以降だけを並べ替える。データが1行以下なら何もしない。
//   ・「本日荷造り状態」「配置設定」「資材データ」のような“1件のJSONを固定セルで持つ”シートには使わない
//     （並べ替える"行の一覧"という概念が無いため）。「月末棚卸（実数）」のような資材ごとの横持ち表にも使わない。
//   ・書き込み系の各関数（seisanSave_・hojoSave_・saveNizukuri_・savePosition_・nzMarkNew_・shizaiBackupSave 等）
//     から、データを書いた直後に呼ぶ。呼ぶたびに全体を並べ替えるので、上書き(upsert)でも追記でも
//     常に「更新日時が新しい行が上」を保てる。
function sortSheetDescByHeader_(sh, headerName){
  try{
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if(lastRow < 3 || lastCol < 1) return;   // ヘッダーのみ・空・1行だけなら並べ替え不要
    var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var col = -1;
    for(var c = 0; c < header.length; c++){ if(String(header[c] == null ? '' : header[c]).trim() === headerName){ col = c + 1; break; } }
    if(col < 0) return;   // 見出しが見つからない（シート形式が違う）ときは何もしない
    sh.getRange(2, 1, lastRow - 1, lastCol).sort({ column: col, ascending: false });
  }catch(e){ Logger.log('sortSheetDescByHeader_ failed for ' + (sh && sh.getName && sh.getName()) + ': ' + e); }
}
// 力量表スプレッドシート内「実績」シート（日付/荷造り舟数/荷造りkg/歩留まり）から今日の行
function readJisseki_(today){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var sh = ss.getSheetByName(CFG.JISSEKI_SHEET || '実績');
  if(!sh){ sh = ss.insertSheet(CFG.JISSEKI_SHEET || '実績'); sh.appendRow(['日付','荷造り舟数','荷造りkg','歩留まり(%)']); return { funes:null, kg:null, budomari:null }; }
  var v = sh.getDataRange().getValues();
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy-MM-dd');
  function num(x){ if(x===''||x==null) return null; var n=(typeof x==='number')?x:Number(String(x).replace(/[^0-9.\-]/g,'')); return isNaN(n)?null:n; }
  for(var r=1; r<v.length; r++){
    var d = v[r][0];
    var dstr = (d instanceof Date) ? Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd') : String(d).trim();
    if(dstr === todayStr){
      var bd = num(v[r][3]);
      if(bd !== null && bd <= 1) bd = bd * 100;   // 0.4478→44.78 に正規化
      return { funes: num(v[r][1]), kg: num(v[r][2]), budomari: bd };
    }
  }
  return { funes:null, kg:null, budomari:null };
}

// ============================================================
// ② 本日荷造りの「荷造数（作った分）」を、力量表SS内の“テスト用”生産ログへ記録（書き込み）
//   ★荷造数は「作った日（生産日）」の行に入れる。本日作った分＝今日／前日作った分＝前日、と“作った日”ごとに1行。
//   呼び方：?type=nizukuriSave&sdate=2026/8/10（生産日）&ddate=2026/8/10（納品日）&cust=…&bunrui=…&nyusu=3.34&made=30&by=PC名
//   ・キー＝生産日|納品日|取引先|区分|入数。同じキーは1行に“上書き”、無ければ“追記”。他の行・他のシートには触れない。
//   ・進捗シートは各納品日の行で集計する（生産日は集計では畳む／発注書「進捗」と基準を揃えるため2026-08-25変更）。
//     生産ログ自体は生産日・納品日を両方持つので、書き込み側（このsaveNizukuri_）は変更なし。
//   ・本番の発注書「進捗」シートは読むだけ（ここでは書かない）。ログは NZ_TEST_SHEET（力量表SS内・自動作成）。
//   ※旧「本日荷造り進捗(テスト)」シートとは列構成が違うので、シート名を変えて新規作成にしています（旧シートは削除OK）。
// ============================================================
function nzTestSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.NZ_TEST_SHEET || '本日荷造り進捗(テスト)';
  var HEAD = ['キー','生産日','納品日','取引先','区分','入数(kg)','荷造数c/s','荷造数kg','更新日時','端末'];
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(HEAD); try{ sh.setFrozenRows(1); }catch(e){} }
  return { sh: sh, HEAD: HEAD };
}
function nzDateObj_(s){   // "yyyy/M/d" → Date（力量表の日付列と数式で突き合わせるため日付型で保存）
  var dm = String(s||'').split('/');
  if(dm.length === 3){ var yy=Number(dm[0]), mm=Number(dm[1]), dd=Number(dm[2]); if(yy&&mm&&dd) return new Date(yy, mm-1, dd); }
  return s;
}
function saveNizukuri_(p){
  p = p || {};
  var sdate  = String(p.sdate || p.date || '').trim();   // 生産日（作った日）。旧パラメータ date も生産日として受ける
  var ddate  = String(p.ddate || p.date || '').trim();   // 納品日
  var cust   = String(p.cust   || '').trim();
  var bunrui = String(p.bunrui || '').trim();
  var nyusu  = Number(p.nyusu) || 0;
  var made   = Math.max(0, Math.round(Number(p.made != null ? p.made : p.today) || 0));  // その生産日に作った数(c/s)
  var by     = String(p.by || '').trim();
  if(!sdate || !cust) return { ok:false, error:'sdate(生産日) と cust は必須です' };
  var key  = sdate + '|' + ddate + '|' + cust + '|' + bunrui + '|' + nyusu;

  var lock = LockService.getScriptLock();
  try{ lock.waitLock(15000); }catch(e){ return { ok:false, error:'busy' }; }
  try{
    var t = nzTestSheet_(), sh = t.sh;
    var now = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    // 生産日・納品日は“文字列 yyyy/M/d”で保存する（Date型だとシートのTZで前日にずれ、数式が一致しないため）
    var row = [ key, sdate, ddate, cust, bunrui, nyusu, made, Math.round(made*nyusu), now, by ];
    // 同じキーの行だけ上書き。無ければ末尾に追記。既存の他行には触れない。
    var last = sh.getLastRow(), found = -1;
    if(last >= 2){
      var keys = sh.getRange(2, 1, last-1, 1).getValues();
      for(var i=0;i<keys.length;i++){ if(String(keys[i][0]) === key){ found = i+2; break; } }
    }
    if(found > 0){ sh.getRange(found, 1, 1, row.length).setValues([row]); }
    else         { sh.appendRow(row); found = sh.getLastRow(); }
    // B列(生産日)・C列(納品日)を“文字列”に固定（自動で日付型に変換されてTZずれするのを防ぐ）
    var bc = sh.getRange(found, 2, 1, 2); bc.setNumberFormat('@'); bc.setValues([[sdate, ddate]]);
    sortSheetDescByHeader_(sh, '更新日時');   // 2026-09-03：常に更新日時の新しい順（降順）で並べ直す
    return { ok:true, key:key, savedAt:now, row:found };
  } finally { try{ lock.releaseLock(); }catch(e){} }
}
// ② 生産ログを読む（デバッグ/将来の復元用）。生産日×納品日×取引先×入数ごとの荷造数(c/s)を返す。読むだけ。
function getNizukuriProgress_(p){
  var t = nzTestSheet_(), sh = t.sh;
  var last = sh.getLastRow();
  var map = {};
  if(last >= 2){
    var v = sh.getRange(2, 1, last-1, 7).getValues();   // キー..荷造数c/s
    for(var i=0;i<v.length;i++){
      var k = String(v[i][0] || ''); if(!k) continue;
      map[k] = Number(v[i][6]) || 0;   // 荷造数c/s
    }
  }
  return { ok:true, log: map };
}

// ============================================================
// 配置図 → ポジション履歴シート（力量表スプレッドシート内）に保存
//   ?type=savePosition&ampm=AM|PM&data=[{"z":"場所","n":"氏名"},...]（JSONをURLエンコード）
//   日付は当日。同じ「日付＋AM/PM」の行は上書き（消してから追記）。シートが無ければ自動作成。
// ============================================================
function savePosition_(params){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var HEAD = ['日付', 'AM/PM', '場所', '氏名', '保存日時'];
  var sh = ss.getSheetByName(CFG.POSITION_SHEET || 'ポジション履歴');
  if(!sh){ sh = ss.insertSheet(CFG.POSITION_SHEET || 'ポジション履歴'); sh.appendRow(HEAD); }

  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var now   = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm');
  var ampm  = String(params.ampm || 'AM').toUpperCase();
  ampm = (ampm.indexOf('P') >= 0) ? 'PM' : 'AM';

  var rows;
  try{ rows = JSON.parse(params.data || '[]'); }catch(e){ return { ok:false, error:'data JSON parse error' }; }
  if(!(rows instanceof Array)) rows = [];

  // 既存データを読み、同じ日付＋AM/PMの行を除いて残す（＝上書き）
  var data = sh.getDataRange().getValues();
  var kept = [ (data.length ? data[0] : HEAD) ];
  for(var i = 1; i < data.length; i++){
    var d0 = data[i][0];
    var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
    if(!(dstr === today && String(data[i][1]).trim().toUpperCase() === ampm)) kept.push(data[i]);
  }
  // 今の配置を追記
  rows.forEach(function(r){ kept.push([today, ampm, String(r.z || ''), String(r.n || ''), now]); });

  sh.clearContents();
  sh.getRange(1, 1, kept.length, HEAD.length).setValues(kept.map(function(r){
    var a = r.slice(0, HEAD.length); while(a.length < HEAD.length) a.push(''); return a;
  }));
  sortSheetDescByHeader_(sh, '保存日時');   // 2026-09-03：常に保存日時の新しい順（降順）で並べ直す
  return { ok:true, saved: rows.length, date: today, ampm: ampm };
}

// ============================================================
// ① 配置図の設定（ゾーン設定・優先番号・手動配置）を全PCで共有（クラウド保存）
//   これまで各PCのブラウザ(localStorage)だけに保存していたため、他のPCで開くとリンクしなかった。
//   → 力量表SS内の「配置設定」シートに JSON 1件で保存し、どのPCで数字を変えても全PCで同じになる。
//   「配置設定」シートのレイアウト：B1=rev（保存のたび+1） / B2=savedAt / B3=savedBy / B4=json
//   ・GET  ?type=haichiCfgGet            → { rev, savedAt, savedBy, json }
//   ・POST { action:'haichiCfgSave', json:'{"zoneCfg":..,"prio":..,"layout":..}', rev:<基準rev>, by:'<PC名>', force? }
//        → { ok, rev, savedAt } / 競合時 { ok:false, conflict:true, rev, json }（相手の最新も返す＝マージ用）
// ============================================================
function haichiCfgSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.HAICHI_CFG_SHEET || '配置設定';
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange('A1').setValue('rev');     sh.getRange('B1').setValue(0);
    sh.getRange('A2').setValue('savedAt'); sh.getRange('B2').setValue('');
    sh.getRange('A3').setValue('savedBy'); sh.getRange('B3').setValue('');
    sh.getRange('A4').setValue('json');    sh.getRange('B4').setValue('');
  }
  return sh;
}
function getHaichiCfg_(){
  var sh = haichiCfgSheet_();
  return {
    rev:     Number(sh.getRange('B1').getValue()) || 0,
    savedAt: String(sh.getRange('B2').getValue() || ''),
    savedBy: String(sh.getRange('B3').getValue() || ''),
    json:    String(sh.getRange('B4').getValue() || '')
  };
}
function saveHaichiCfg_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh  = haichiCfgSheet_();
    var cur = Number(sh.getRange('B1').getValue()) || 0;
    var base = Number(body.rev);
    // 基準rev（＝読み込んだ時のrev）が現在のrevと違う＝他PCが先に更新済み。force指定が無ければ競合として最新を返す
    if(!body.force && !isNaN(base) && base !== cur){
      return { ok:false, conflict:true, rev:cur, savedAt:String(sh.getRange('B2').getValue()||''), savedBy:String(sh.getRange('B3').getValue()||''), json:String(sh.getRange('B4').getValue()||'') };
    }
    var newRev = cur + 1;
    var now = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    sh.getRange('B1').setValue(newRev);
    sh.getRange('B2').setValue(now);
    sh.getRange('B3').setValue(String(body.by || ''));
    sh.getRange('B4').setValue(String(body.json || ''));
    return { ok:true, rev:newRev, savedAt:now };
  } finally {
    lock.releaseLock();
  }
}
// エディタから▶実行して現在の保存状況（rev/savedAt/savedBy）を確認
function testHaichiCfg(){ Logger.log(JSON.stringify(getHaichiCfg_(), null, 2)); }

// ============================================================
// ③ 本日荷造りの「状態(未確定/確定/作成済)・作った分・前日修正」を全PCで共有（力量表SS内・JSON1件）
//   これまで各PCのブラウザ(localStorage)だけに保存していたので、他PC・URL移行・キャッシュ削除で消えていた。
//   → GAS「本日荷造り状態」シートに JSON 1件で保存＝全PC共有・消えない。
//   保存形（json）＝ { status:{行ID:状態}, prod:{行キー:{"yyyy/M/d(生産日)":ケース}}, prevOvr:{行キー:ケース} }
//     ・行ID/行キー＝納品日|取引先|区分|入数（黒板側と同じ）。状態'mikettei'は既定なので保存しない。
//   ・GET  ?type=nizukuriStateGet            → { rev, savedAt, savedBy, json }
//   ・POST { action:'nizukuriStateSave', patch:{…}, by:'…' } → サーバ側で現在値へマージ（＝各PCの変更が衝突せず全部残る）
//                                              → { ok, rev, savedAt, json(マージ後の全体) }
// ============================================================
function nzStateSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.NZ_STATE_SHEET || '本日荷造り状態';
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange('A1').setValue('rev');     sh.getRange('B1').setValue(0);
    sh.getRange('A2').setValue('savedAt'); sh.getRange('B2').setValue('');
    sh.getRange('A3').setValue('savedBy'); sh.getRange('B3').setValue('');
    sh.getRange('A4').setValue('json');    sh.getRange('B4').setValue('');
  }
  return sh;
}
function getNizukuriState_(){
  var sh = nzStateSheet_();
  return {
    rev:     Number(sh.getRange('B1').getValue()) || 0,
    savedAt: String(sh.getRange('B2').getValue() || ''),
    savedBy: String(sh.getRange('B3').getValue() || ''),
    json:    String(sh.getRange('B4').getValue() || '')
  };
}
// 変更分だけ送られてくる patch を、現在の保存内容へマージ（各PCの変更が衝突せず全部残るのが狙い）
function nzMergeState_(cur, patch){
  cur = cur || {}; patch = patch || {};
  cur.status = cur.status || {}; cur.prod = cur.prod || {}; cur.prevOvr = cur.prevOvr || {};
  // 状態：'mikettei'/空/null は既定なので削除、それ以外は上書き
  if(patch.status){
    Object.keys(patch.status).forEach(function(k){
      var v = patch.status[k];
      if(v == null || v === '' || v === 'mikettei') delete cur.status[k]; else cur.status[k] = String(v);
    });
  }
  // 前日修正：null は解除（自動に戻す）、数値は上書き
  if(patch.prevOvr){
    Object.keys(patch.prevOvr).forEach(function(k){
      var v = patch.prevOvr[k];
      if(v == null) delete cur.prevOvr[k]; else cur.prevOvr[k] = Number(v) || 0;
    });
  }
  // 作った分：生産日ごとのケース数。0/null はその日を削除。行が空になったら行ごと削除
  if(patch.prod){
    Object.keys(patch.prod).forEach(function(key){
      var days = patch.prod[key] || {};
      cur.prod[key] = cur.prod[key] || {};
      Object.keys(days).forEach(function(d){
        var c = Number(days[d]) || 0;
        if(c > 0) cur.prod[key][d] = c; else delete cur.prod[key][d];
      });
      if(!Object.keys(cur.prod[key]).length) delete cur.prod[key];
    });
  }
  // ★ day：黒板の当日限り値を全PC共有（数量変更/午前区切り/真空ピロートグル/終了目標時刻）
  //   targetOvr/amSnap/offZones は「y-m-d」キーごと、helpEnd は日付非依存の1値。null は削除。
  if(patch.day){
    cur.day = cur.day || {};
    cur.day.targetOvr = cur.day.targetOvr || {};
    cur.day.amSnap    = cur.day.amSnap    || {};
    cur.day.offZones  = cur.day.offZones  || {};
    var pd = patch.day;
    if(pd.targetOvr){ Object.keys(pd.targetOvr).forEach(function(d){ var v=pd.targetOvr[d]; if(v==null) delete cur.day.targetOvr[d]; else cur.day.targetOvr[d]=Number(v)||0; }); }
    if(pd.amSnap){    Object.keys(pd.amSnap).forEach(function(d){    var v=pd.amSnap[d];    if(v==null) delete cur.day.amSnap[d];    else cur.day.amSnap[d]=v; }); }
    if(pd.offZones){  Object.keys(pd.offZones).forEach(function(d){  var v=pd.offZones[d];  if(v==null) delete cur.day.offZones[d];  else cur.day.offZones[d]=v; }); }
    if('helpEnd' in pd){ if(pd.helpEnd==null || pd.helpEnd==='') delete cur.day.helpEnd; else cur.day.helpEnd=String(pd.helpEnd); }
    // ⑥ absent＝配置図で「出勤」チェックを外した人（当日限り・全PC共有）。キー「y-m-d」→ {氏名:true}
    if(pd.absent){ cur.day.absent = cur.day.absent || {};
      Object.keys(pd.absent).forEach(function(d){ var v=pd.absent[d]; if(v==null) delete cur.day.absent[d]; else cur.day.absent[d]=v; }); }
    // ⑧ busy＝繁忙期（7月/11月 第1週）の「全資材 再確認」実施記録。キー「YYYY-07」→ {by,at}
    if(pd.busy){ cur.day.busy = cur.day.busy || {};
      Object.keys(pd.busy).forEach(function(k){ var v=pd.busy[k]; if(v==null) delete cur.day.busy[k]; else cur.day.busy[k]=v; }); }
    // 🧰 shizai＝資材管理アプリのアラート要約（発注推奨・納品遅延・棚卸要否など）。
    //   資材アプリが計算した結果を丸ごと送ってくるので丸ごと差し替え（他フィールドのような部分マージはしない）。null で削除。
    //   電子黒板はこれを見て、資材アプリを開いていないPCでも資材アラートを表示できる。
    if('shizai' in pd){ if(pd.shizai==null) delete cur.day.shizai; else cur.day.shizai=pd.shizai; }
    // 🔮 plan＝配置図（予測）。キー「YYYY-MM-DD」→ { layout:{AM,PM}, absent:{氏名:true}, off:{ゾーンid:true} }
    //    ＝明日以降の配置を全PC（液晶）で共有する。当日ぶん（absent/offZones）とは別物なので混ぜない。
    if(pd.plan){ cur.day.plan = cur.day.plan || {};
      Object.keys(pd.plan).forEach(function(d){ var v=pd.plan[d]; if(v==null) delete cur.day.plan[d]; else cur.day.plan[d]=v; }); }
    // ② ampmOvr＝本日実績の午前・午後を手で入れ直した分。キー「y-m-d」→ {funes:{am,pm},kg:{am,pm},cs:{am,pm}}
    //    null＝その日の手入力を全部消して自動計算に戻す。
    if(pd.ampmOvr){ cur.day.ampmOvr = cur.day.ampmOvr || {};
      Object.keys(pd.ampmOvr).forEach(function(d){ var v=pd.ampmOvr[d]; if(v==null) delete cur.day.ampmOvr[d]; else cur.day.ampmOvr[d]=v; }); }
    // ⑨ funeStock＝舟数モニターの「前日ストック」／seisanPlan＝「生産者予定」。どちらもキー「y-m-d」→ 数値。
    if(pd.funeStock){ cur.day.funeStock = cur.day.funeStock || {};
      Object.keys(pd.funeStock).forEach(function(d){ var v=pd.funeStock[d]; if(v==null) delete cur.day.funeStock[d]; else cur.day.funeStock[d]=Number(v)||0; }); }
    if(pd.seisanPlan){ cur.day.seisanPlan = cur.day.seisanPlan || {};
      Object.keys(pd.seisanPlan).forEach(function(d){ var v=pd.seisanPlan[d]; if(v==null) delete cur.day.seisanPlan[d]; else cur.day.seisanPlan[d]=Number(v)||0; }); }
    // 過ぎた日の予測は使わないので消す（状態blobが際限なく太らないように）
    if(cur.day.plan){
      var _todayKey = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
      Object.keys(cur.day.plan).forEach(function(k){ if(String(k) < _todayKey) delete cur.day.plan[k]; });
    }
    // 当日限りの値（午前午後の手入力・前日ストック・生産者予定）は7日より前を掃除する。
    //   キーは「y-m-d」（月日はゼロ埋め無し）なので、文字列比較ではなく日付に直して比べる。
    (function(){
      var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      ['ampmOvr','funeStock','seisanPlan'].forEach(function(sec){
        var m = cur.day[sec]; if(!m) return;
        Object.keys(m).forEach(function(k){
          var p = String(k).split('-');
          if(p.length !== 3) return;
          var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
          if(!isNaN(dt.getTime()) && dt < cutoff) delete m[k];
        });
      });
    })();
  }
  return cur;
}
function saveNizukuriState_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh  = nzStateSheet_();
    var cur = {};
    try{ cur = JSON.parse(String(sh.getRange('B4').getValue() || '') || '{}'); }catch(_){ cur = {}; }
    var merged = nzMergeState_(cur, body.patch || {});
    var json   = JSON.stringify(merged);
    var newRev = (Number(sh.getRange('B1').getValue()) || 0) + 1;
    var now    = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    sh.getRange('B1').setValue(newRev);
    sh.getRange('B2').setValue(now);
    sh.getRange('B3').setValue(String(body.by || ''));
    sh.getRange('B4').setValue(json);
    return { ok:true, rev:newRev, savedAt:now, json:json };
  } finally {
    lock.releaseLock();
  }
}
// エディタから▶実行して現在の保存状況を確認
function testNizukuriState(){ Logger.log(JSON.stringify(getNizukuriState_(), null, 2)); }

// ============================================================
// ★ まとめ取得（黒板の30秒ポーリング用）：主要データを1回のリクエストで返す
//   これまで黒板は更新のたびに nizukuriState / nizukuri / haichi / shift / haichiCfg / summary /
//   hojo / seisan を別々に叩いていた（＝1周期で7〜8回）。30秒間隔にすると3台分で実行回数が多すぎるため、
//   ここで全部まとめて1回で返す（＝呼び出し回数が約1/8）。1つが失敗しても他は返るよう各処理を try で包む。
//   ・GET ?type=bundle&days=<n>&date=<yyyy/M/d(任意ジャンプ)>&hdate=<yyyy-MM-dd(任意・圃場/生産者)>
// ============================================================
function getBundle_(params){
  params = params || {};
  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var hdate = params.hdate || today;
  function safe(fn){ try{ return fn(); }catch(e){ return { error: String(e && e.message || e) }; } }
  return {
    nizukuriState: safe(function(){ return getNizukuriState_(); }),
    nizukuri:      safe(function(){ return getNizukuri_(params); }),
    haichi:        safe(function(){ return getHaichi_(); }),
    shift:         safe(function(){ return getShift_(); }),
    haichiCfg:     safe(function(){ return getHaichiCfg_(); }),
    summary:       safe(function(){ return getSummary_(params); }),
    hojo:          safe(function(){ return hojoGet_({ date: hdate }); }),
    seisan:        safe(function(){ return seisanGet_({ date: hdate }); }),
    todo:          safe(function(){ return getTodoBoard_(today); })
  };
}
// エディタから▶実行して、まとめ取得の中身を確認（各セクションがerror無く返るか）
function testBundle(){ Logger.log(JSON.stringify(getBundle_({ days: 3 }), null, 2)); }

// ============================================================
// ⑩ センターTODOマスタ → 電子黒板のTODO表示（2026-09-08 新設。曽我さん依頼）
//   「センターTODOマスタ」シート（BOARD_DATA_SS_ID内・A=業務/B=頻度、1行目は見出し）に行を足すだけで、
//   起動時の初回取得と bundle（30秒）経由で電子黒板へ自動反映される（GAS再デプロイ不要＝シート編集だけでOK）。
//   チェックを入れる／外すたびに「TODO履歴」シートへ1行追記（上書きしない＝そのまま操作履歴になる）。
//   ・チェック状態は別に持たず、指定日の履歴の中から各業務の最新行（＝先頭。毎回降順ソートしているため）を見て組み立てる。
//   ・GET  ?type=todoMaster&callback=xxx              → { date, items:[{task,freq}], state:{業務名:true,...} }
//   ・POST { action:'todoLog', date, task, freq, checked:true/false, by } → 履歴へ1行追記
// ============================================================
function todoMasterSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.TODO_MASTER_SHEET || 'センターTODOマスタ';
  return ss.getSheetByName(name);   // マスタ未作成なら null（呼び出し側は空リスト扱い）
}
function todoMasterList_(){
  var sh = todoMasterSheet_();
  if(!sh) return [];
  var v = sh.getDataRange().getValues();
  var out = [];
  for(var r = 1; r < v.length; r++){   // 1行目は見出し（業務/頻度）
    var task = String(v[r][0] || '').trim();
    if(!task) continue;
    out.push({ task: task, freq: String(v[r][1] || '').trim() });
  }
  return out;
}
function todoLogSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.TODO_LOG_SHEET || 'TODO履歴';
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(['日付','業務','頻度','操作','更新日時','端末']); }
  return sh;
}
// 指定日（yyyy-MM-dd）の各業務の最新チェック状態を履歴から組み立てる（{業務名:true}＝チェック中のものだけ持つ）
function getTodoState_(dateStr){
  var sh = todoLogSheet_();
  var v = sh.getDataRange().getValues();
  var state = {}, seen = {};
  // todoLogAppend_ が毎回「更新日時」降順にソートしているので、各業務は最初に出会った行が最新。
  for(var r = 1; r < v.length; r++){
    var d = v[r][0];
    var dstr = (d instanceof Date) ? Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd') : String(d).trim();
    if(dstr !== dateStr) continue;
    var task = String(v[r][1] || '').trim();
    if(!task || seen[task]) continue;
    seen[task] = true;
    if(String(v[r][3] || '').trim() === 'チェック') state[task] = true;
  }
  return state;
}
// ⑪ Googleカレンダー（CFG.TODO_CALENDAR_ID）の指定日の予定から、タイトルにキーワード（既定「センター」）を
//   含むものだけ拾い、キーワードを取り除いた残りをタスク名としてTODOへ渡す（例：「センター包丁研ぎチェック」→「包丁研ぎチェック」）。
//   同名タスクが複数の予定にあれば1件にまとめる。カレンダー未共有・権限エラー等は空配列を返すだけ＝他の機能に影響させない。
function todoCalendarList_(dateStr){
  try{
    var day = parseYmd_(dateStr) || new Date();
    var calId = CFG.TODO_CALENDAR_ID;
    if(!calId) return [];
    var cal = CalendarApp.getCalendarById(calId);
    if(!cal) return [];
    var start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    var events = cal.getEvents(start, end);
    var keyword = CFG.TODO_CALENDAR_KEYWORD || 'センター';
    var out = [], seen = {};
    for(var i = 0; i < events.length; i++){
      var title = String(events[i].getTitle() || '').trim();
      if(title.indexOf(keyword) === -1) continue;
      var task = title.split(keyword).join('').trim();
      if(!task || seen[task]) continue;
      seen[task] = true;
      out.push({ task: task, freq: '予定' });
    }
    return out;
  }catch(err){
    return [];
  }
}
function getTodoBoard_(dateStr){
  dateStr = String(dateStr || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var items = todoMasterList_();
  var seen = {};
  for(var i = 0; i < items.length; i++) seen[items[i].task] = true;
  var calItems = todoCalendarList_(dateStr);
  for(var j = 0; j < calItems.length; j++){
    if(seen[calItems[j].task]) continue;   // マスタと同名タスクがあればマスタ側（頻度ラベル）を優先
    seen[calItems[j].task] = true;
    items.push(calItems[j]);
  }
  return { date: dateStr, items: items, state: getTodoState_(dateStr) };
}
function todoLogAppend_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(15000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh = todoLogSheet_();
    var date = String(body.date || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
    var task = String(body.task || '').trim();
    if(!task) return { ok:false, error:'業務名が空です' };
    var freq = String(body.freq || '').trim();
    var now  = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    var action = body.checked ? 'チェック' : '解除';
    sh.appendRow([date, task, freq, action, now, String(body.by || '')]);
    sortSheetDescByHeader_(sh, '更新日時');
    return { ok:true, date:date, task:task, action:action };
  }catch(err){
    return { ok:false, error:String(err && err.message || err) };
  }finally{
    try{ lock.releaseLock(); }catch(e){}
  }
}
// エディタから▶実行して疎通確認（マスタ一覧＋カレンダー予定・本日の状態）
function testTodo(){
  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  Logger.log(JSON.stringify(getTodoBoard_(today), null, 2));
}
// エディタから▶実行してカレンダー連携だけ疎通確認（権限が無い場合はここで承認ダイアログが出る）
function testTodoCalendar(){
  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  Logger.log(JSON.stringify(todoCalendarList_(today), null, 2));
}
// []（空）になる時の原因切り分け用。どの段階で0件になっているかをログに出す（cal未取得／予定0件／キーワード不一致のどれか）。
function testTodoCalendarDiag(){
  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var day = parseYmd_(today) || new Date();
  var calId = CFG.TODO_CALENDAR_ID;
  Logger.log('calId = ' + calId);
  var cal = null;
  try{ cal = CalendarApp.getCalendarById(calId); }catch(e){ Logger.log('getCalendarById error: ' + e); }
  Logger.log('cal = ' + (cal ? cal.getName() : 'NULL（IDが違う/アクセス権が無い可能性）'));
  if(!cal) return;
  var start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  Logger.log('range = ' + start + ' 〜 ' + end);
  var events = [];
  try{ events = cal.getEvents(start, end); }catch(e){ Logger.log('getEvents error: ' + e); }
  Logger.log('events.length = ' + events.length);
  for(var i = 0; i < events.length; i++){
    Logger.log('  [' + i + '] title=「' + events[i].getTitle() + '」 start=' + events[i].getStartTime());
  }
}

// ============================================================
// ⑤ 配置図の画像を Googleドライブに保存（POST）
//   本文(JSON)＝ { action:'savePositionImg', img:'data:image/png;base64,....', date:'yyyy-MM-dd'?, when:'HH:mm'? }
//   保存先＝CFG.HAICHI_IMG_FOLDER_ID のフォルダ（空なら「配置図画像」フォルダを自動作成）
//   ファイル名＝「日付_時間.png」（例 2026-08-07_10-19.png）。押すたびに1枚ずつ溜まっていく。
//   返却＝ { ok, name, url, folder }
// ============================================================
function haichiImgFolder_(){
  var id = String(CFG.HAICHI_IMG_FOLDER_ID || '').trim();
  if(id){ try{ return DriveApp.getFolderById(id); }catch(e){ /* IDが無効なら名前で探す */ } }
  var name = CFG.HAICHI_IMG_FOLDER_NAME || '配置図画像';
  var it = DriveApp.getFoldersByName(name);
  if(it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}
function savePositionImg_(body){
  try{
    var dataUrl = String(body.img || '');
    var m = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if(!m) return { ok:false, error:'画像データ(dataURL)が不正です' };
    var mime = m[1], b64 = m[2];
    var now  = new Date();
    var date = String(body.date || '').trim() || Utilities.formatDate(now, CFG.TZ, 'yyyy-MM-dd');
    var when = String(body.when || '').trim() || Utilities.formatDate(now, CFG.TZ, 'HH:mm');
    var ext  = (mime.indexOf('png') >= 0) ? 'png' : (mime.indexOf('jpeg') >= 0 ? 'jpg' : 'png');
    var fname = date + '_' + when.replace(/[:：]/g, '-') + '.' + ext;   // 日付_時間.png
    var bytes = Utilities.base64Decode(b64);
    var blob  = Utilities.newBlob(bytes, mime, fname);
    var folder = haichiImgFolder_();
    var file = folder.createFile(blob);
    return { ok:true, name:fname, url:file.getUrl(), folder:folder.getName(), folderUrl:folder.getUrl() };
  }catch(err){
    return { ok:false, error:String(err && err.message || err) };
  }
}

// ============================================================
// ⑥ 圃場（畑）から持ってきた蓮根の舟数記録（力量表SS内「圃場舟数」シート）
//   列：A=日付 / B=圃場 / C=舟数 / D=更新日時
//   ・hojoGet（GET, JSONP）：?type=hojoGet&date=yyyy-MM-dd → { date, fields:[{name,funes}], total }
//   ・hojoSave（POST）：{ action:'hojoSave', date, fields:[{name,funes},...] } → その日付の行を全入れ替え(upsert)
// ============================================================
function hojoSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.HOJO_SHEET || '圃場舟数';
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(['日付','圃場','舟数','更新日時']); }
  return sh;
}
function hojoGet_(params){
  params = params || {};
  var sh = hojoSheet_();
  var date = String(params.date || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var v = sh.getDataRange().getValues();
  var fields = [], total = 0, idx = {};   // idx: 圃場名→fieldsの位置（重複行の合算・マスタ照合に使う）
  for(var r = 1; r < v.length; r++){
    var d0 = v[r][0];
    var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
    if(dstr !== date) continue;
    var nm = String(v[r][1] || '').trim(); if(!nm) continue;
    var f = Number(v[r][2]) || 0;
    if(idx[nm] !== undefined){ fields[idx[nm]].funes += f; }   // 同名が複数行あれば合算
    else { idx[nm] = fields.length; fields.push({ name: nm, funes: f }); }
    total += f;
  }
  // ★ 生産DX（朝礼ボード）から「今日活動する圃場名マスタ」を取り込む＝毎朝、手入力なしで圃場が並ぶ。
  //   舟数0で追加し、既に記録済みの舟数は保持（マスタは名前だけを供給・数量は現場入力を優先）。fromDx=生産DX由来の目印。
  hojoMasterNames_(date).forEach(function(nm){
    if(idx[nm] === undefined){ idx[nm] = fields.length; fields.push({ name: nm, funes: 0, fromDx: true }); }
    else { fields[idx[nm]].fromDx = true; }
  });
  return { date: date, fields: fields, total: total };
}
// 生産DX（朝礼ボード）から今日活動する圃場名の配列を返す。生産DXのdateが今日と一致する時だけ採用（古い日を混ぜない）。
//   ・過去日の照会（params.date≠今日）ではマスタを混ぜず、記録シートそのままを返す。
//   ・キャッシュ60秒で外部呼び出しを間引く（bundleが30秒ごとでも実呼び出しは60秒に1回）。
//   ・生産DXが落ちていても [] を返す＝圃場舟数の既存記録は必ず表示できる。
function hojoMasterNames_(date){
  var today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  if(date && date !== today) return [];
  var url = String(CFG.SEISAN_DX_URL || '').trim();
  if(!url) return [];
  var cache = null, ckey = 'hojoMaster_' + today;
  try{ cache = CacheService.getScriptCache(); var hit = cache.get(ckey); if(hit != null) return JSON.parse(hit); }catch(_){}
  var names = [];
  try{
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions:true, followRedirects:true });
    if(res.getResponseCode() === 200){
      var obj = JSON.parse(res.getContentText());
      if(obj && obj.ok && (obj.fields instanceof Array) && hojoSameDay_(obj.date, today)){
        var seen = {};
        obj.fields.forEach(function(f){
          var nm = String((f && (f.field != null ? f.field : f.name)) || '').trim();
          if(nm && !seen[nm]){ seen[nm] = true; names.push(nm); }
        });
      }
    }
  }catch(e){ names = []; }
  try{ if(cache) cache.put(ckey, JSON.stringify(names), 60); }catch(_){}
  return names;
}
// 'yyyy/M/d'（生産DX）や 'yyyy-MM-dd' などの表記ゆれを吸収して today(yyyy-MM-dd)と同じ日か判定
function hojoSameDay_(a, today){
  var m = String(a || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if(!m) return false;
  return (m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2)) === today;
}
// エディタから▶実行：生産DXから今日の圃場マスタが取れるか確認（名前配列がログに出ればOK）
function testHojoMaster(){
  Logger.log('SEISAN_DX_URL = ' + CFG.SEISAN_DX_URL);
  try{
    var res = UrlFetchApp.fetch(String(CFG.SEISAN_DX_URL||'').trim(), { muteHttpExceptions:true, followRedirects:true });
    Logger.log('HTTP ' + res.getResponseCode());
    Logger.log('raw = ' + res.getContentText().slice(0, 800));
  }catch(e){ Logger.log('fetch error = ' + e); }
  Logger.log('採用される圃場名 = ' + JSON.stringify(hojoMasterNames_('')));
}
function hojoSave_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh = hojoSheet_();
    var HEAD = ['日付','圃場','舟数','更新日時'];
    var date = String(body.date || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
    var now  = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm');
    var fields = (body.fields instanceof Array) ? body.fields : [];

    // 既存データから、その日付の行を除いて残す（＝upsert）
    var data = sh.getDataRange().getValues();
    var kept = [ (data.length ? data[0] : HEAD) ];
    for(var i = 1; i < data.length; i++){
      var d0 = data[i][0];
      var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
      if(dstr !== date) kept.push(data[i]);
    }
    var total = 0;
    fields.forEach(function(f){
      var nm = String(f.name || '').trim(); if(!nm) return;
      var fn = Number(f.funes) || 0;
      kept.push([date, nm, fn, now]);
      total += fn;
    });
    sh.clearContents();
    sh.getRange(1, 1, kept.length, HEAD.length).setValues(kept.map(function(r){
      var a = r.slice(0, HEAD.length); while(a.length < HEAD.length) a.push(''); return a;
    }));
    sortSheetDescByHeader_(sh, '更新日時');   // 2026-09-03：常に更新日時の新しい順（降順）で並べ直す
    return { ok:true, date: date, count: fields.length, total: total };
  }catch(err){
    return { ok:false, error:String(err && err.message || err) };
  }finally{
    try{ lock.releaseLock(); }catch(e){}
  }
}

// ============================================================
// ⑥ 生産者の持ち込み舟数・出来高（力量表SS内「生産者記録」シート）
//   列：A=日付 / B=時間帯(AM/PM) / C=生産者 / D=区分(洗い/土) / E=サイズkg / F=舟数 / G=出来高kg / H=更新日時
//   ・seisanGet（GET, JSONP）：?type=seisanGet&date=yyyy-MM-dd
//        → { date, list:[{name,ampm,rows:{"区分|サイズ":舟数}}], totalFunes, totalKg }
//   ・seisanSave（POST）：{ action:'seisanSave', date, list:[{name,ampm,rows:{...}}], knownKeys:['AM|庄内',...] }
//        → 生産者(時間帯|名前)単位の行マージ保存（2026-09-08改修。旧仕様＝日付ごと全入れ替えだった）。
//   ※生産者ごとの記録用。電子黒板の実績数量には含めない。出来高kg＝舟数×サイズkg。
// ============================================================
function seisanSheet_(){
  var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var name = CFG.SEISAN_SHEET || '生産者記録';
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(['日付','時間帯','生産者','区分','サイズkg','舟数','出来高kg','更新日時']); }
  return sh;
}
function seisanGet_(params){
  params = params || {};
  var sh = seisanSheet_();
  var date = String(params.date || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  var v = sh.getDataRange().getValues();
  var map = {}, order = [], totalFunes = 0, totalKg = 0;
  for(var r = 1; r < v.length; r++){
    var d0 = v[r][0];
    var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
    if(dstr !== date) continue;
    var ampm = String(v[r][1] || 'AM').trim().toUpperCase(); if(ampm !== 'PM') ampm = 'AM';
    var name = String(v[r][2] || '').trim(); if(!name) continue;
    var grp  = String(v[r][3] || '').trim();
    var size = Number(v[r][4]) || 0;
    var funes = Number(v[r][5]) || 0;
    var kg    = Number(v[r][6]); if(!kg) kg = funes * size;
    var mk = ampm + '|' + name;
    if(!map[mk]){ map[mk] = { name:name, ampm:ampm, rows:{}, funes:0 }; order.push(mk); }
    if(grp === '収穫舟数'){ map[mk].funes = funes; continue; }   // ③ 生産者の収穫舟数（板の本日の荷造り舟数・本日実績へ加算する値）
    if(size > 0 && funes > 0) map[mk].rows[grp + '|' + size] = funes;
    totalFunes += funes; totalKg += kg;
  }
  return { date: date, list: order.map(function(k){ return map[k]; }), totalFunes: totalFunes, totalKg: Math.round(totalKg*10)/10 };
}
// ⑥-b 発注書ブックに「生産者記録」シートを作り、力量表と同じ形式の履歴行を反映する（新規シート・その日の分は洗い替え）
function seisanOrderSheet_(){
  var ss = SpreadsheetApp.openById(CFG.ORDER_SS_ID);
  var name = '生産者記録';
  var HEAD = ['日付','時間帯','生産者','区分','サイズkg','舟数','出来高kg','更新日時'];
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(HEAD); try{ sh.setFrozenRows(1); }catch(e){} }
  return sh;
}
function seisanPushToOrder_(date, rowsForDate){
  var HEAD = ['日付','時間帯','生産者','区分','サイズkg','舟数','出来高kg','更新日時'];
  var sh = seisanOrderSheet_();
  var data = sh.getDataRange().getValues();
  var kept = [ (data.length ? data[0] : HEAD) ];
  for(var i = 1; i < data.length; i++){
    var d0 = data[i][0];
    var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
    if(dstr !== date) kept.push(data[i]);
  }
  rowsForDate.forEach(function(r){ kept.push(r); });
  sh.clearContents();
  sh.getRange(1, 1, kept.length, HEAD.length).setValues(kept.map(function(r){
    var a = r.slice(0, HEAD.length); while(a.length < HEAD.length) a.push(''); return a;
  }));
  sortSheetDescByHeader_(sh, '更新日時');   // 2026-09-03：発注書側の「生産者記録」も更新日時の降順で保つ
}
function seisanSave_(body){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(e){ return { ok:false, error:'busy（他の保存処理中）' }; }
  try{
    var sh = seisanSheet_();
    var HEAD = ['日付','時間帯','生産者','区分','サイズkg','舟数','出来高kg','更新日時'];
    var date = String(body.date || '').trim() || Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
    var now  = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm');
    var list = (body.list instanceof Array) ? body.list : [];
    // 2026-09-08：この端末が今回の編集を始める前に知っていた生産者(時間帯|名前)一覧。
    // 複数PC/タブが同時に生産者タブを触ると、旧仕様（日付ごと全入れ替え）では
    // 「自分がまだ読み込んでいない、他PCが追加/入力した生産者」の行を保存のたびに消してしまっていた
    // （例：庄内さんの半端8.5をPC-Aが保存した直後、それを知らないPC-Bが別生産者の保存をすると消える）。
    // knownKeysに無い＝この端末がまだ知らない生産者＝他PC由来とみなして触らない。
    var knownKeys = (body.knownKeys instanceof Array) ? body.knownKeys : null;

    var incomingKeySet = {};
    list.forEach(function(p){
      var name = String(p.name || '').trim(); if(!name) return;
      var ampm = (String(p.ampm||'AM').toUpperCase() === 'PM') ? 'PM' : 'AM';
      incomingKeySet[ampm + '|' + name] = true;
    });
    var knownKeySet = null;
    if(knownKeys){ knownKeySet = {}; knownKeys.forEach(function(k){ knownKeySet[String(k)] = true; }); }

    var data = sh.getDataRange().getValues();
    var kept = [ (data.length ? data[0] : HEAD) ];
    var keptForDate = [];   // ⑥-b 発注書「生産者記録」へ流す、マージ後のこの日付ぶん全行
    for(var i = 1; i < data.length; i++){
      var d0 = data[i][0];
      var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
      if(dstr !== date){ kept.push(data[i]); continue; }
      if(!knownKeySet){ continue; }   // knownKeys未送信（旧クライアント/初回保存）＝従来どおりこの日付は全部書き直す
      var rAmpm = String(data[i][1] || 'AM').trim().toUpperCase(); if(rAmpm !== 'PM') rAmpm = 'AM';
      var rKey = rAmpm + '|' + String(data[i][2] || '').trim();
      if(incomingKeySet[rKey]) continue;   // 今回のリストにいる生産者＝このあと新しい行で丸ごと書き直す
      if(knownKeySet[rKey]) continue;      // この端末が知っていたのに今回リストに無い＝削除された
      kept.push(data[i]); keptForDate.push(data[i]);   // この端末が知らない生産者＝他PC入力なので保持
    }
    var rowsN = 0, totalFunes = 0, totalKg = 0;
    list.forEach(function(p){
      var name = String(p.name || '').trim(); if(!name) return;
      var ampm = (String(p.ampm||'AM').toUpperCase() === 'PM') ? 'PM' : 'AM';
      var rows = (p.rows && typeof p.rows === 'object') ? p.rows : {};
      Object.keys(rows).forEach(function(key){
        var funes = Number(rows[key]) || 0; if(funes <= 0) return;
        var parts = String(key).split('|');
        var grp  = parts[0] || '';
        var size = Number(parts[1]) || 0;
        var kg = funes * size;
        var row = [date, ampm, name, grp, size, funes, Math.round(kg*10)/10, now];
        kept.push(row); keptForDate.push(row);
        rowsN++; totalFunes += funes; totalKg += kg;
      });
      var pf = Number(p.funes) || 0;   // ③ 収穫舟数（板の舟数へ加算する値）＝区分「収穫舟数」の1行で保存
      if(pf > 0){ var pfRow = [date, ampm, name, '収穫舟数', 0, pf, 0, now]; kept.push(pfRow); keptForDate.push(pfRow); rowsN++; }
    });
    sh.clearContents();
    sh.getRange(1, 1, kept.length, HEAD.length).setValues(kept.map(function(r){
      var a = r.slice(0, HEAD.length); while(a.length < HEAD.length) a.push(''); return a;
    }));
    sortSheetDescByHeader_(sh, '更新日時');   // 2026-09-03：常に更新日時の新しい順（降順）で並べ直す
    // ⑥-b 発注書「生産者記録」（新規シート）へも同じ内容を反映。失敗しても力量表側の保存自体は成立させる。
    // マージ後のこの日付ぶん全行（keptForDate）を渡す＝力量表側と発注書側で内容がズレないように。
    try{ seisanPushToOrder_(date, keptForDate); }catch(e2){ Logger.log('seisanPushToOrder_ failed: ' + e2); }
    return { ok:true, date: date, rows: rowsN, totalFunes: totalFunes, totalKg: Math.round(totalKg*10)/10 };
  }catch(err){
    return { ok:false, error:String(err && err.message || err) };
  }finally{
    try{ lock.releaseLock(); }catch(e){}
  }
}
// 動作確認用（GASエディタで実行）：今日の生産者記録を保存→取得
function testSeisan(){
  var r1 = seisanSave_({ date: Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'),
    list:[{ name:'田畑', ampm:'AM', rows:{ '洗い|3.34':2, '洗い|2':10 } }] });
  Logger.log(JSON.stringify(r1));
  Logger.log(JSON.stringify(seisanGet_({ date: r1.date })));
}

// ============================================================
// ① シフト → 本日の出勤者（シフトカード・配置図の在席）
// ============================================================
// 'YYYY-MM-DD' → Date（Dateの文字列解析はタイムゾーンでずれるので数値で組み立てる）。不正なら null。
function parseYmd_(s){
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
// シフト（出勤者・AM/PM人数）を返す。params.date（YYYY-MM-DD）で明日以降の日も取れる＝🔮配置図（予測）。
//   省略時はこれまでどおり「今日」＝黒板の当日表示・bundle は挙動が変わらない。
function getShift_(params){
  params = params || {};
  var target = parseYmd_(params.date) || new Date();
  var ss = SpreadsheetApp.openById(CFG.SHIFT_SS_ID);
  var name = shiftSheetName_(target);     // R8年8月 など（指定日の月シート）
  var sh = ss.getSheetByName(name);
  if(!sh) return { error:'シート「' + name + '」が見つかりません', date:name };

  var values = sh.getDataRange().getValues();
  var today = target;   // 以下「today」＝対象日（既定は今日／予測タブは明日以降の指定日）

  // 日付ヘッダー行と今日の列を探す（行のズレに強い動的検出）
  var pos = findDateColumn_(values, today);
  if(pos.col < 0) return { error: Utilities.formatDate(today, CFG.TZ, 'M月d日') + 'の列が見つかりません', date:name };

  // 氏名列＝日付ヘッダー行より下で、最初に文字が並ぶ左側の列を推定（通常はA or B列）
  var nameCol = guessNameColumn_(values, pos.row);
  var present = [], off = [], centerRoster = [], support = [];
  var status = {};   // 氏名 → 本日のシフトセル文字（〇/休/午後休/時間指定 等）＝配置図で出勤チェックの横に表示
  var amCount = null, pmCount = null;
  // 「センター合計人数」行の次〜「社員シフト」行の前＝応援ゾーン（氏名を問わず〇なら現場に入れる）。
  // 「社員シフト」行より下は、〇でもセンター(現場)には入らない人たち（益田・古澤…等の社員シフト表）。
  var centerEnded = false;    // 「社員シフト」行を過ぎたら true＝完全に対象外
  var inSupportZone = false;  // 「センター合計人数」の次〜「社員シフト」の前＝応援ゾーン
  for(var r = pos.row + 1; r < values.length; r++){
    var rowText = values[r].join('');
    var isAggRow = rowText.indexOf('センター合計人数') >= 0;
    var isStaffRow = rowText.indexOf('社員シフト') >= 0;
    // 集計行「午前人数」「午後人数」を拾って本日列の値を採用（センター人数 AM/PM 用。境界より下でも拾う）
    for(var c = 0; c < values[r].length; c++){
      var label = String(values[r][c] || '').replace(/\s/g, '');
      if(!label) continue;
      if(label.indexOf('午前人数') >= 0){ var av = Number(values[r][pos.col]); if(!isNaN(av)) amCount = av; }
      if(label.indexOf('午後人数') >= 0){ var pv = Number(values[r][pos.col]); if(!isNaN(pv)) pmCount = pv; }
    }
    var nm = String(values[r][nameCol] || '').trim();
    var cell = String(values[r][pos.col] || '').trim();
    if(isStaffRow){ centerEnded = true; inSupportZone = false; continue; }   // ここから下は完全に対象外
    if(isAggRow){ inSupportZone = true; continue; }   // 合計行自体は人ではないのでスキップ、次行から応援ゾーン
    // ★ 応援（「センター合計人数」の次の行〜「社員シフト」の前＝例：木ノ下・梅野・応援①等）＝本日〇なら現場に入れる。
    //   力量表には登録せず support として板へ渡し、板側でフレッシュ扱い＝基本「はつり」へ自動配置。
    //   氏名パターンでは絞らない（実名の応援枠も拾えるように。行の「位置」だけで判定する）。
    if(inSupportZone){
      var supAgg = !nm || /人数|合計|社員|パート|アルバイト|実習生|営業|経理|監査|給料|会議|予算|休み|役員/.test(nm);
      if(!supAgg){
        status[nm] = cell;
        if(cell && cell !== '休'){ present.push(nm); support.push(nm); }   // 〇に限らず時間指定・午後休なども出勤扱い
      }
      continue;
    }
    var isAggregate = !nm || /人数|合計|社員|パート|アルバイト|実習生|応援|営業|経理|監査|給料|会議|予算|休み|役員/.test(nm);
    // センター在籍ロスター（現場メンバー）＝境界行より上の人名だけ
    if(!centerEnded && !isAggregate) centerRoster.push(nm);
    if(centerEnded || isAggregate) continue;   // 社員シフト以降・集計行は出勤者に含めない
    if(nm) status[nm] = cell;   // 本日のシフトセル文字をそのまま保持（空欄も含む）
    if(cell === CFG.MARK_PRESENT) present.push(nm);
    else if(cell === '休') off.push(nm);
    else if(cell) present.push(nm);   // 時間指定・午後休など＝出勤扱い
  }
  // 新しい人を力量表へ自動登録（センター在籍で力量表に未登録の人だけ・血縁の緩い突合で重複を防ぐ）
  var added = [];
  if(CFG.SKILL_AUTO_REGISTER){ try{ added = registerNewWorkers_(centerRoster); }catch(e){} }
  return {
    date: Utilities.formatDate(today, CFG.TZ, 'yyyy-MM-dd'),
    sheet: name,
    count: present.length,
    amCount: amCount,   // 見つからなければ null（黒板側は現時点の出勤者数で代用）
    pmCount: pmCount,
    present: present,
    off: off,
    status: status,     // 氏名→本日のシフトセル文字（配置図の出勤チェック横に表示）
    roster: centerRoster,
    support: support,   // ★ 応援（本日〇）＝板側でフレッシュ扱い→はつり。力量表には登録しない。
    added: added        // 今回力量表に新規追加した氏名
  };
}

// 半角カナ→全角(base)・空白/濁点/長音の除去・小書き仮名を大書きに畳む＝重複登録の誤爆を避ける緩い正規化
function normSkillName_(s){
  s = String(s || '');
  var H = {'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ',
    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ﾝ':'ン'};
  var out = '';
  for(var i = 0; i < s.length; i++){ var c = s[i]; out += (H[c] || c); }
  out = out.replace(/[\s　ﾞﾟ゛゜・･ー]/g, '');
  out = out.replace(/[ァィゥェォッャュョヮ]/g, function(c){
    return {'ァ':'ア','ィ':'イ','ゥ':'ウ','ェ':'エ','ォ':'オ','ッ':'ツ','ャ':'ヤ','ュ':'ユ','ョ':'ヨ','ヮ':'ワ'}[c];
  });
  return out;
}

// センター在籍者のうち力量表に未登録の人を、力量表へ空スキルで追記して返す（追加した氏名の配列）
function registerNewWorkers_(names){
  if(!names || !names.length) return [];
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(15000); }catch(e){ return []; }
  try{
    var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
    var sh = ss.getSheetByName(CFG.SKILL_SHEET);
    if(!sh) return [];
    var v = sh.getDataRange().getValues();
    var hr = 0;
    for(var r = 0; r < Math.min(v.length, 6); r++){
      if(v[r].some(function(x){ return String(x).indexOf('氏名') >= 0 || String(x).indexOf('名前') >= 0; })){ hr = r; break; }
    }
    var header = v[hr].map(function(x){ return String(x).trim(); });
    var nameCol = 0;
    header.forEach(function(h, i){ if(h.indexOf('氏名') >= 0 || h.indexOf('名前') >= 0) nameCol = i; });
    var width = Math.max(header.length, 1);
    var existKeys = [];
    for(var r2 = hr + 1; r2 < v.length; r2++){
      var nm0 = String(v[r2][nameCol] || '').trim();
      if(nm0){ var k0 = normSkillName_(nm0); if(k0) existKeys.push(k0); }
    }
    function matched(key){
      if(!key || key.length < 2) return true;   // 短すぎる名は誤爆回避のため追加しない
      for(var i = 0; i < existKeys.length; i++){
        var e = existKeys[i];
        if(e.length >= 2 && (key.indexOf(e) >= 0 || e.indexOf(key) >= 0)) return true;
      }
      return false;
    }
    var added = [], uniq = {};
    names.forEach(function(nm){
      nm = String(nm || '').trim(); if(!nm) return;
      var key = normSkillName_(nm);
      if(!key || uniq[key] || matched(key)) return;
      uniq[key] = true; existKeys.push(key);
      var row = []; for(var j = 0; j < width; j++) row.push('');
      row[nameCol] = nm;
      sh.appendRow(row);
      added.push(nm);
    });
    return added;
  }catch(e){ return []; }
  finally{ try{ lock.releaseLock(); }catch(e){} }
}

// today → 「R{和暦}年{月}」。和暦 = 西暦 - 2018（2026→R8）
function shiftSheetName_(d){
  var y = Number(Utilities.formatDate(d, CFG.TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(d, CFG.TZ, 'M'));
  return 'R' + (y - 2018) + '年' + m + '月';
}

// 日付ヘッダー行（Date型セルが複数並ぶ行）と、today に一致する列を探す
function findDateColumn_(values, today){
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  for(var r = 0; r < Math.min(values.length, 15); r++){
    var dateCells = 0, hit = -1;
    for(var c = 0; c < values[r].length; c++){
      var v = values[r][c];
      if(v instanceof Date){
        dateCells++;
        if(hit < 0 && Utilities.formatDate(v, CFG.TZ, 'yyyy/M/d') === todayStr) hit = c;
      }
    }
    if(dateCells >= 3 && hit >= 0) return { row:r, col:hit }; // 「8月」等の文字は日付扱いしない
  }
  return { row:-1, col:-1 };
}

// 氏名列の推定：ヘッダー行の下で、最も文字（氏名）が埋まっている左側の列
//   ⑦ 手袋サイズ列（S/M/L だけが並ぶ）を氏名列と誤認しないよう、サイズらしい1〜2文字は数えない。
function guessNameColumn_(values, headerRow){
  var skip = gloveColLetterToIndex_(CFG.GLOVE_SIZE_COL);   // 手袋サイズ列は氏名列にしない（A列に移した2026-08-18対策）
  var best = 0, bestCount = -1;
  for(var c = 0; c < 4; c++){
    if(skip != null && c === skip) continue;
    var cnt = 0;
    for(var r = headerRow + 1; r < values.length; r++){
      var v = String(values[r][c] || '').trim();
      if(v && !/^[〇休\d:：]/.test(v) && !GLOVE_SIZE_RE.test(v)) cnt++;
    }
    if(cnt > bestCount){ bestCount = cnt; best = c; }
  }
  return best;
}

// ============================================================
// ⑦ 手袋（シフト連動）＝ ?type=gloveUsage&start=YYYY-MM-DD&end=YYYY-MM-DD
//   センター人数 1人 × CFG.GLOVE_PER_PERSON 枚／日 で手袋を使う。
//   ・各人のサイズ＝月シートの「サイズ列」（氏名ごと1回だけ S/M/L 等を記入）。
//   ・その日のセルが「休」以外（〇・時間指定・午後休など）＝出勤1人としてカウント。
//   ・返却：日別のサイズ別人数（＝枚数は人数×perPerson。資材アプリ側で掛ける）。
//     過去（使用実績）も未来（シフト提出済みの予定）も同じ形で返すので、
//     資材アプリは「45日分の在庫が確保できているか」の判定にそのまま使える。
// ============================================================
var GLOVE_SIZE_RE = /^(SS|S|M|L|LL|2L|3L|4L|XS|XL|XXL|M-L|S-M|ＳＳ|Ｓ|Ｍ|Ｌ|ＬＬ)$/i;
// 手袋サイズの表記ゆれを畳む（全角→半角・小文字→大文字）
function gloveNormSize_(s){
  s = String(s == null ? '' : s).replace(/[\s　]/g, '');
  if(!s) return '';
  var out = '';
  for(var i = 0; i < s.length; i++){
    var code = s.charCodeAt(i);
    out += (code >= 0xFF01 && code <= 0xFF5E) ? String.fromCharCode(code - 0xFEE0) : s[i];
  }
  return out.toUpperCase();
}
// 'C' → 2（0起点）。空欄や不正値は null。
function gloveColLetterToIndex_(letter){
  var s = String(letter || '').trim().toUpperCase();
  if(!/^[A-Z]{1,2}$/.test(s)) return null;
  var n = 0;
  for(var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}
// サイズ列を探す：①CFGで指定 ②見出しに「手袋/サイズ」 ③S/M/L が3つ以上並ぶ列（氏名列の右〜日付列の手前）
function gloveSizeColumn_(values, headerRow, nameCol){
  var fixed = gloveColLetterToIndex_(CFG.GLOVE_SIZE_COL);
  if(fixed != null && fixed !== nameCol) return fixed;
  var firstDate = -1;
  for(var c = 0; c < values[headerRow].length; c++){ if(values[headerRow][c] instanceof Date){ firstDate = c; break; } }
  var limit = (firstDate >= 0) ? firstDate : Math.min(8, values[headerRow].length);
  for(var r = 0; r <= headerRow; r++){
    var row = values[r] || [];
    for(var c2 = 0; c2 < row.length && c2 < limit; c2++){
      if(/手袋|サイズ|ｻｲｽﾞ/.test(String(row[c2] || '').replace(/[\s　]/g, ''))) return c2;
    }
  }
  for(var c3 = 0; c3 < limit; c3++){
    if(c3 === nameCol) continue;
    var hit = 0;
    for(var r2 = headerRow + 1; r2 < values.length; r2++){
      if(GLOVE_SIZE_RE.test(String(values[r2][c3] || '').trim())) hit++;
    }
    if(hit >= 3) return c3;
  }
  return -1;
}
function gloveParseDate_(s){
  var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
// 月シートの共通情報（値・日付ヘッダー行・氏名列・サイズ列）を1シート1回だけ読む
function gloveSheetInfo_(ss, sname, cache){
  if(cache[sname] !== undefined) return cache[sname];
  var sh = ss.getSheetByName(sname);
  if(!sh){ cache[sname] = null; return null; }
  var values = sh.getDataRange().getValues();
  var headerRow = -1;
  for(var r = 0; r < Math.min(values.length, 15); r++){
    var cnt = 0;
    for(var c = 0; c < values[r].length; c++){ if(values[r][c] instanceof Date) cnt++; }
    if(cnt >= 3){ headerRow = r; break; }
  }
  var info = null;
  if(headerRow >= 0){
    var nameCol = guessNameColumn_(values, headerRow);
    info = { sheet:sh, name:sname, values:values, headerRow:headerRow,
             nameCol:nameCol, sizeCol:gloveSizeColumn_(values, headerRow, nameCol) };
  }
  cache[sname] = info;
  return info;
}
// 氏名の表記ゆれを畳んで突合キーにする（空白は無視・全角英数は半角へ）
function gloveNameKey_(s){
  s = String(s == null ? '' : s).replace(/[\s　]/g, '');
  var out = '';
  for(var i = 0; i < s.length; i++){
    var code = s.charCodeAt(i);
    out += (code >= 0xFF01 && code <= 0xFF5E) ? String.fromCharCode(code - 0xFEE0) : s[i];
  }
  return out;
}
// スプレッドシート内の月シート（R◯年◯月）の名前を全部
function gloveMonthSheetNames_(ss){
  return ss.getSheets().map(function(sh){ return sh.getName(); })
           .filter(function(n){ return /^R\d+年\d+月$/.test(n); });
}
// 人ではない行（合計・社員シフト見出し等）か
function gloveSkipRow_(nm){
  return /人数|合計|社員|パート|アルバイト|実習生|営業|経理|監査|給料|会議|予算|休み|役員/.test(nm);
}
// 「センター合計人数」「社員シフト」の行に来たら、そこから下は社員シフト表＝センターの人ではない
function gloveIsBoundary_(row){
  return row.some(function(x){
    var s = String(x); return s.indexOf('センター合計人数') >= 0 || s.indexOf('社員シフト') >= 0;
  });
}
// その行を手袋の対象として扱うか（集計行・社員シフト以降は除外。ただし「応援」だけは現場に入るので対象）
function gloveRowUse_(nm, centerEnded){
  if(/^応援/.test(nm)) return true;
  return !(centerEnded || gloveSkipRow_(nm));
}
// 全月シートを1回なめて「氏名 → サイズ」を作る。
// ★どれか1枚（例 R8年8月のA列）に書いてあれば、同じ名前の人は他の月でもそのサイズとして扱う。
function gloveCollectSizes_(ss, cache){
  var people = {}, sizeSet = {}, from = [];
  gloveMonthSheetNames_(ss).forEach(function(sname){
    var info = gloveSheetInfo_(ss, sname, cache);
    if(!info || info.sizeCol < 0) return;
    var got = 0, ended = false;
    for(var r = info.headerRow + 1; r < info.values.length; r++){
      if(gloveIsBoundary_(info.values[r])) ended = true;
      var nm = String(info.values[r][info.nameCol] || '').trim();
      if(!nm || !gloveRowUse_(nm, ended)) continue;
      var size = gloveNormSize_(info.values[r][info.sizeCol]);
      if(!size || !GLOVE_SIZE_RE.test(size)) continue;
      var key = gloveNameKey_(nm);
      if(!people[key]) people[key] = { name:nm, size:size };   // 先に見つかったシートの値を採用
      sizeSet[size] = true; got++;
    }
    if(got) from.push({ sheet:sname, sizeCol:info.sizeCol + 1, count:got });
  });
  return { people:people, sizes:Object.keys(sizeSet).sort(), from:from };
}
function getGloveUsage_(params){
  params = params || {};
  var per = Number(CFG.GLOVE_PER_PERSON) || 8;
  var today = new Date(Utilities.formatDate(new Date(), CFG.TZ, 'yyyy/MM/dd') + ' 00:00:00');
  // 既定＝今日の90日前〜今日の120日後（過去の使用実績＋提出済みの先の予定を両方まかなう）
  var start = gloveParseDate_(params.start) || new Date(today.getTime() - 90 * 86400000);
  var end   = gloveParseDate_(params.end)   || new Date(today.getTime() + 120 * 86400000);
  if(end < start) end = start;

  var ss = SpreadsheetApp.openById(CFG.SHIFT_SS_ID);
  var cache = {};
  var fmt = function(d){ return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd'); };
  var startStr = fmt(start), endStr = fmt(end);

  // ① まず全月シートから氏名→サイズを作る（1枚に書けば全月に効く）
  var col = gloveCollectSizes_(ss, cache);
  var people = col.people;

  // ② 日別・サイズ別の出勤人数を数える
  var days = [], missing = [], sheetsUsed = [], notes = [];
  var cur = new Date(start.getFullYear(), start.getMonth(), 1);
  var last = new Date(end.getFullYear(), end.getMonth(), 1);
  var guard = 0;
  while(cur <= last && guard++ < 36){
    var sname = shiftSheetName_(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    var info = gloveSheetInfo_(ss, sname, cache);
    if(!info){ notes.push(sname + '：シートが無い／日付ヘッダー行が見つかりません'); continue; }
    sheetsUsed.push({ sheet:sname, sizeCol:info.sizeCol >= 0 ? info.sizeCol + 1 : 0 });

    // この月の対象日 → 列
    var dayCols = [];
    for(var c4 = 0; c4 < info.values[info.headerRow].length; c4++){
      var dv = info.values[info.headerRow][c4];
      if(!(dv instanceof Date)) continue;
      var ds = fmt(dv);
      if(ds < startStr || ds > endStr) continue;
      dayCols.push({ date:ds, col:c4 });
    }
    if(!dayCols.length) continue;

    var acc = {};   // date → {total, noSize, bySize, names}
    dayCols.forEach(function(dc){ acc[dc.date] = { total:0, noSize:0, bySize:{}, names:[] }; });

    var centerEnded = false;
    for(var r2 = info.headerRow + 1; r2 < info.values.length; r2++){
      var row = info.values[r2];
      if(gloveIsBoundary_(row)) centerEnded = true;
      var nm = String(row[info.nameCol] || '').trim();
      if(!nm || !gloveRowUse_(nm, centerEnded)) continue;   // 集計行・社員シフト以降は数えない（応援は例外）

      var p = people[gloveNameKey_(nm)];
      var size = p ? p.size : '';
      if(!size && missing.indexOf(nm) < 0) missing.push(nm);

      dayCols.forEach(function(dc){
        var cell = String(row[dc.col] || '').trim();
        if(!cell || cell === '休') return;                    // 休・空欄は出勤に数えない
        var a = acc[dc.date];
        a.total++;
        a.names.push(nm);   // 出勤者の名前（資材アプリ側の「人のリスト」と突き合わせてサイズを判定するために渡す）
        if(size) a.bySize[size] = (a.bySize[size] || 0) + 1;
        else a.noSize++;
      });
    }
    dayCols.forEach(function(dc){
      var a = acc[dc.date];
      if(a.total > 0) days.push({ date:dc.date, total:a.total, bySize:a.bySize, noSize:a.noSize, names:a.names });
    });
  }

  days.sort(function(a, b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  if(!col.from.length) notes.push('どの月シートにも手袋サイズが見つかりません（CFG.GLOVE_SIZE_COL=' + (CFG.GLOVE_SIZE_COL || '自動') + '）');
  var flat = {};
  Object.keys(people).forEach(function(k){ flat[people[k].name] = people[k].size; });
  return {
    ok: days.length > 0,
    perPerson: per,
    start: startStr, end: endStr, today: fmt(today),
    sizes: col.sizes,
    days: days,
    people: flat,          // 氏名 → サイズ（全月共通）
    sizeFrom: col.from,    // サイズを読めたシートと件数
    missing: missing,      // どの月シートにもサイズが無い人（この分は noSize に入る）
    sheets: sheetsUsed,
    notes: notes,
    error: days.length ? null : ('手袋サイズを読めませんでした。' + (notes.join(' / ') || 'シフト表をご確認ください'))
  };
}
// エディタから▶実行して、手袋の読み取り結果（サイズの出どころ・日別人数）を確認
function testGloveUsage(){
  var r = getGloveUsage_({});
  Logger.log('サイズの出どころ: ' + JSON.stringify(r.sizeFrom));
  Logger.log('読んだシート: ' + JSON.stringify(r.sheets));
  Logger.log('サイズ: ' + JSON.stringify(r.sizes) + ' / 1人あたり ' + r.perPerson + '枚 / 登録 ' + Object.keys(r.people).length + '名');
  Logger.log('サイズ未記入: ' + JSON.stringify(r.missing));
  Logger.log('直近5日: ' + JSON.stringify(r.days.slice(0, 5), null, 2));
  Logger.log('日数: ' + r.days.length + ' / notes: ' + JSON.stringify(r.notes));
}

// ------------------------------------------------------------
// ▶実行用：1枚のシートに書いた手袋サイズを、氏名一致で全部の月シートのサイズ列（既定A列）へコピーする
//   ・空欄のセルだけ埋める（すでに何か入っているセルは絶対に触らない）
//   ・氏名の突合は空白を無視（「髙木　綾」と「髙木 綾」は同じ人）
//   ・入力規則があっても書けるように、その列の規則を一時退避してから戻す
//   ・引数に月シート名を1つ渡すと、そのシートだけに入れる（例 spreadGloveSizes('R8年9月')）
// ------------------------------------------------------------
function spreadGloveSizes(onlySheet){
  var ss = SpreadsheetApp.openById(CFG.SHIFT_SS_ID);
  var cache = {};
  var col = gloveCollectSizes_(ss, cache);
  var people = col.people;
  if(!Object.keys(people).length){
    Logger.log('サイズがどこにも書かれていません。まず1枚のシート（例 R8年8月）のA列にS/M/Lを入れてください。');
    return;
  }
  Logger.log('サイズの出どころ: ' + JSON.stringify(col.from) + ' / ' + Object.keys(people).length + '名ぶん');
  var log = [], totalFilled = 0;
  gloveMonthSheetNames_(ss).forEach(function(sname){
    if(onlySheet && sname !== onlySheet) return;
    var info = gloveSheetInfo_(ss, sname, cache);
    if(!info){ log.push(sname + '：日付ヘッダー行が無いのでスキップ'); return; }
    var c = gloveColLetterToIndex_(CFG.GLOVE_SIZE_COL);
    if(c == null) c = info.sizeCol;
    if(c == null || c < 0){ log.push(sname + '：サイズ列が決められないのでスキップ'); return; }
    if(c === info.nameCol){ log.push(sname + '：サイズ列が氏名列と同じなのでスキップ'); return; }

    var nRows = info.values.length - (info.headerRow + 1);
    if(nRows <= 0){ log.push(sname + '：行がありません'); return; }
    var rng = info.sheet.getRange(info.headerRow + 2, c + 1, nRows, 1);
    var vals = rng.getValues();
    var filled = 0, names = [], unknown = [], ended = false;
    for(var i = 0; i < nRows; i++){
      var r = info.headerRow + 1 + i;
      if(gloveIsBoundary_(info.values[r])) ended = true;
      var nm = String(info.values[r][info.nameCol] || '').trim();
      if(!nm || !gloveRowUse_(nm, ended)) continue;   // 社員シフト表には書かない（応援は対象）
      if(String(vals[i][0] == null ? '' : vals[i][0]).trim()) continue;   // 何か入っている＝触らない
      var p = people[gloveNameKey_(nm)];
      if(!p){ if(unknown.indexOf(nm) < 0) unknown.push(nm); continue; }
      vals[i][0] = p.size; filled++; names.push(nm + '=' + p.size);
    }
    if(filled){
      var rules = rng.getDataValidations();          // 入力規則にはじかれないよう一時解除
      rng.clearDataValidations();
      rng.setValues(vals);
      rng.setDataValidations(rules);
      totalFilled += filled;
    }
    // サイズ列の見出しが空なら「サイズ」と入れておく（人が見て分かるように）
    var head = String(info.values[info.headerRow][c] || '').trim();
    if(!head) info.sheet.getRange(info.headerRow + 1, c + 1).setValue('サイズ');
    log.push(sname + '：' + filled + '人ぶん入れました'
      + (names.length ? '（' + names.slice(0, 5).join('・') + (names.length > 5 ? ' ほか' : '') + '）' : '')
      + (unknown.length ? ' ／ サイズ未登録 ' + unknown.length + '名: ' + unknown.slice(0, 8).join('・') : ''));
  });
  Logger.log(log.join('\n'));
  Logger.log('合計 ' + totalFilled + 'セルに入れました。');
}

// ============================================================
// ② 力量表 → 配置図（氏名 × 力量 ○△×）
// ============================================================
function getHaichi_(){
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
  var sh = ss.getSheetByName(CFG.SKILL_SHEET);
  if(!sh) return { error:'シート「' + CFG.SKILL_SHEET + '」が見つかりません' };
  var v = sh.getDataRange().getValues();

  // ヘッダー行＝「氏名」を含む行を探す。無ければ1行目。
  var hr = 0;
  for(var r = 0; r < Math.min(v.length, 6); r++){
    if(v[r].some(function(x){ return String(x).indexOf('氏名') >= 0 || String(x).indexOf('名前') >= 0; })){ hr = r; break; }
  }
  var header = v[hr].map(function(x){ return String(x).trim(); });
  var nameCol = 0, catCol = -1;
  header.forEach(function(h,i){
    if(h.indexOf('氏名')>=0 || h.indexOf('名前')>=0) nameCol = i;
    if(h === '区分') catCol = i;
  });
  // 力量の列＝氏名列より右で見出しがある列。No./区分は除外。
  var skip = { 'No.':1, 'No':1, '氏名':1, '名前':1, '区分':1, '':1 };
  var skillCols = [];
  for(var c = nameCol + 1; c < header.length; c++){ if(!skip[header[c]]) skillCols.push({ i:c, key:header[c] }); }

  var people = [];
  for(var r2 = hr + 1; r2 < v.length; r2++){
    var nm = String(v[r2][nameCol] || '').trim();
    if(!nm) continue;
    var skills = {};
    skillCols.forEach(function(sc){ skills[sc.key] = String(v[r2][sc.i] || '').trim(); });
    people.push({ name:nm, category:(catCol>=0?String(v[r2][catCol]||'').trim():''), skills:skills });
  }
  // ① 配置図の優先番号は「配置優先」シート（数字）から。板はこれを優先番号として使う（力量表○×は初期値/能力の参考）。
  return { skillKeys: skillCols.map(function(s){ return s.key; }), people: people, prio: getPrioFromSheet_() };
}

// ============================================================
// ① 配置優先（力量表SS内「配置優先」シート）＝配置図の11工程ごとの優先番号を“数字”で管理・編集する場所。
//   行＝氏名 / 列＝11工程。数字＝優先(1が最優先)・×＝不可・空欄＝なし。力量表(○×)とは別シート＝力量表は壊さない。
//   ・getPrioFromSheet_()：{氏名:{工程:値}} を返す（getHaichi_ が同梱→板が優先番号として使う・表示する）
//   ・writeBoardPrioToPrioSheet()：▶実行で、今クラウド(配置設定)に入っている“板の数字”を配置優先シートへ一括書き込み（初期移行・1回だけ）
// ============================================================
var PRIO_ZONE_LABELS = ['流し','はつり','仕分け','仕分け補助','箱入れ','ピロー投入','ピロー箱入れ','真空投入','真空箱入れ','パレット','箱織'];
function prioSheet_(){
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
  var name = CFG.PRIO_SHEET || '配置優先';
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,PRIO_ZONE_LABELS.length+1).setValues([['氏名'].concat(PRIO_ZONE_LABELS)]); }
  return sh;
}
function getPrioFromSheet_(){
  var sh = prioSheet_();
  var v = sh.getDataRange().getValues();
  if(v.length < 2) return {};
  var header = v[0].map(function(x){ return String(x).trim(); });
  var nameCol = 0; header.forEach(function(h,i){ if(h.indexOf('氏名')>=0 || h.indexOf('名前')>=0) nameCol = i; });
  var out = {};
  for(var r = 1; r < v.length; r++){
    var nm = String(v[r][nameCol] || '').trim(); if(!nm) continue;
    var m = {};
    for(var c = 0; c < header.length; c++){
      if(c === nameCol) continue;
      var key = header[c]; if(!key) continue;
      var val = String(v[r][c]==null ? '' : v[r][c]).trim();
      if(val !== '') m[key] = val;
    }
    out[nm] = m;
  }
  return out;
}
// ▶エディタから1回だけ実行：今クラウド(配置設定)に入っている板の優先番号を「配置優先」シートへ一括書き込み（初期移行）
function writeBoardPrioToPrioSheet(){
  var cfg = getHaichiCfg_(); var prio = {};
  try{ var o = JSON.parse(cfg.json || '{}'); prio = o.prio || {}; }catch(e){}
  var haichi = getHaichi_();                                  // 力量表の氏名順で並べる
  var names = (haichi.people || []).map(function(p){ return p.name; });
  Object.keys(prio).forEach(function(n){ if(names.indexOf(n) < 0) names.push(n); });
  var sh = prioSheet_();
  sh.clearContents();
  var header = ['氏名'].concat(PRIO_ZONE_LABELS);
  var rows = [header];
  names.forEach(function(nm){
    var pr = prio[nm] || {};
    var row = [nm];
    PRIO_ZONE_LABELS.forEach(function(z){ var val = pr[z]; row.push((val==null || val==='') ? '' : val); });
    rows.push(row);
  });
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  Logger.log('配置優先シートへ ' + (rows.length-1) + '名 書き込み');
  return '✅ 「配置優先」シートに ' + (rows.length-1) + '名 × ' + PRIO_ZONE_LABELS.length + '工程 を書き込みました。以後はこのシートの数字を編集すると配置図に反映されます。';
}

// ============================================================
// ③ 発注書「発注書」メインシート → 本日荷造り
//   取引先＝7行目 / 入数＝9行目 / 区分＝4行目（全列。洗い/土付き等の商品形式。土なし＝洗い）/
//   日付＝B列（10行目〜）。各取引先の列に、その日の荷造数が入る。kg＝荷造数×入数。
//   除外：集計列（合計/舟数/追い送り等）・ﾜﾝﾍﾞｼﾞ・個人/サンプル。
//   params.days … 今日から何日分（既定3）／params.date … 追加で見たい指定日
// ============================================================
var NZ_EXCLUDE_RE = /合計|ワンベジ|カワカミ|生産者|自社|収穫|荷造り|追い送り|ストック|舟数|残数|個人|サンプル|出荷分|2500|入力/;
var NZ_KUBUN_OK   = { '洗い':1, '真空':1, '土付き':1, '下茹で':1, 'ﾋﾟﾛｰ':1, 'ピロー':1, 'C/S':1 };

function getNizukuri_(params){
  params = params || {};
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  if(!sh) return { error:'シート「発注書」が見つかりません' };
  var v = sh.getDataRange().getValues();

  // 取引先行＝B列(index1)が西暦の行
  var nameRow = -1;
  for(var r = 0; r < Math.min(v.length, 15); r++){ var y = Number(v[r][1]); if(y>=2000&&y<=2100){ nameRow=r; break; } }
  if(nameRow < 0) return { error:'取引先行が見つかりません' };
  var nyusuRow   = nameRow + 2;   // 9行目
  var kubunLeft  = nameRow + 1;   // 8行目（C〜Q列＝index2〜16／R列〜はﾜﾝﾍﾞｼﾞ等のフラグ）
  var kubunRight = nameRow - 3;   // 4行目（R列〜の区分）

  // 日付列＝Date型が最多の列（先頭6列から）
  var dateCol = 1, best = -1;
  for(var c0 = 0; c0 < 6; c0++){ var cnt=0; for(var rr=nameRow+3; rr<v.length; rr++){ if(v[rr][c0] instanceof Date) cnt++; } if(cnt>best){ best=cnt; dateCol=c0; } }

  // 取引先の列メタを作成（集計・ﾜﾝﾍﾞｼﾞは除外）。区分は取引先名だけの控えbyNameも作る
  //   ④ 個人注文／その他サンプルは kg単価（C/Sではない）。7行目で名前がある列＋その右の空白サブ列（Mup/C/S/新芽…）を
  //      同じ名前でまとめ、日ごとに合計kgを1行で表示する（入数=1なので日々の値がそのままkg）。
  //   2026-09-03：曽我さん依頼で「合計kg」1本→「Mup」「SとC」「新芽」の3本に分けて表示するよう変更。
  //     実際の列構成（発注書「発注書」シート・現時点）＝個人注文(CW:CY)＝Mup/C/S、その他サンプル(CZ:DC)＝Mup/C/S/新芽。
  //     区分は8行目のラベル（Mup/C/S/新芽）で判定し、個人注文・その他サンプルの区別なくラベルだけで合算する
  //     （C とS は「SとC」1本にまとめる。ラベルがそれ以外/空のときはグループ名のまま集計＝将来の列追加にも対応）。
  var cols = [], byName = {}, lastName = '';
  var KG_GROUP_RE = /個人注文|その他サンプル/;   // ④ kg集計する特別グループ（除外せず、複数サブ列を合計）
  function kgSubName_(label, groupName){
    var t = String(label || '').trim();
    if(t === 'Mup') return 'Mup';
    if(t === 'C' || t === 'S') return 'SとC';
    if(t === '新芽') return '新芽';
    return groupName;   // 想定外のラベル・空欄はグループ名のまま（データが消えないようにする保険）
  }
  for(var c = 2; c < v[nameRow].length; c++){
    var nm = String(v[nameRow][c] || '').replace(/\n/g,' ').trim();
    if(nm) lastName = nm;
    var name = lastName;
    if(!name) continue;
    var isKg = KG_GROUP_RE.test(name);                          // ④ 個人注文／その他サンプルは除外しない（kgで合計表示）
    if(!isKg && NZ_EXCLUDE_RE.test(name)) continue;
    var nyusu = Number(v[nyusuRow][c]);
    if(!(nyusu > 0)) continue;                                  // 入数が数値の列のみ＝取引先列
    var flag8 = String(v[kubunLeft][c] || '').trim();
    var flag4 = String(v[kubunRight][c] || '').trim();          // 発注書「4行目」＝区分（洗い/土付き等の商品形式を全列ここに集約した）
    if(flag8 === 'ﾜﾝﾍﾞｼﾞ' || flag8 === 'ワンベジ' || flag4 === 'ﾜﾝﾍﾞｼﾞ' || flag4 === 'ワンベジ') continue;   // ﾜﾝﾍﾞｼﾞ列は出さない
    if(isKg){ cols.push({ c:c, name:kgSubName_(flag8, name), nyusu:nyusu, kubun:'', kgUnit:true }); continue; }   // ④ kg列＝区分なし・kg単位（8行目ラベル＝Mup/SとC/新芽ごとに日別合計）
    // ② 区分は必ず4行目から取る（従来のC〜Q列=8行目の分岐は廃止）。4行目の商品形式をそのまま取引先の横に表示。
    var kubun = flag4;
    if(kubun === '土なし') kubun = '洗い';
    if(/^[\d.]+$/.test(kubun)) kubun = '';                       // 数値だけ（入数などが紛れた場合）は区分にしない
    if(kubun && !byName[name]) byName[name] = kubun;
    cols.push({ c:c, name:name, nyusu:nyusu, kubun:kubun });
  }

  // 日付→行
  var rowByDate = {};
  for(var r2 = nameRow+3; r2 < v.length; r2++){ var d = v[r2][dateCol]; if(d instanceof Date) rowByDate[Utilities.formatDate(d, CFG.TZ, 'yyyy/M/d')] = r2; }

  var wd = { '1':'月','2':'火','3':'水','4':'木','5':'金','6':'土','7':'日' };
  var notes = ['本日','翌日','翌々日'];

  // ⑤ 2026-10-03追加（曽我さん依頼）：発注書の数字の文字色で状態を自動判定（赤＝未確定／黒・青＝確定）。
  //   読み取りのみ（getFontColorObjects）。行ごとにメモ化。読めなければ色なし＝従来どおり手動の状態。
  //   ⚠条件付き書式・背景色は読めない（素の文字色だけ）。診断＝?type=debugColors&date=
  var colorMemo = {};
  function colorRow_(row){
    if(row < 0) return [];
    if(!colorMemo.hasOwnProperty(row)){
      try{ colorMemo[row] = sh.getRange(row + 1, 1, 1, sh.getLastColumn()).getFontColorObjects()[0].map(nzFontColorHex_); }
      catch(e){ colorMemo[row] = []; }
    }
    return colorMemo[row];
  }

  function makeDay(dt, note){
    var dstr = Utilities.formatDate(dt, CFG.TZ, 'yyyy/M/d');
    var row  = (dstr in rowByDate) ? rowByDate[dstr] : -1;
    var orders = [];
    if(row >= 0){
      var colors = colorRow_(row);
      var kgAgg = {}, kgOrder = [];   // ④ 個人注文／その他サンプル：Mup/SとC/新芽ごとに日別kgを合計して1行に（2026-09-03〜）
      cols.forEach(function(col){
        var qty = Number(v[row][col.c]) || 0;
        if(qty <= 0) return;
        if(col.kgUnit){   // ④ kg列：入数=1なので値＝kg。同名のサブ列を合計。
          if(!(col.name in kgAgg)){ kgAgg[col.name] = 0; kgOrder.push(col.name); }
          kgAgg[col.name] += qty * (col.nyusu || 1);
          return;
        }
        var name = col.name;
        var ov = (CFG.NAME_OVERRIDE || {})[name + '|' + col.nyusu]; if(ov) name = ov;
        var bunrui = col.kubun || byName[col.name] || (CFG.DEFAULT_BUNRUI || '');
        var hex = colors[col.c] || '';
        orders.push({ cust:name, bunrui:bunrui, nyusu:col.nyusu, qty:qty, kg:Math.round(qty*col.nyusu),
                      color: hex ? nzColorClass_(hex) : '', colorHex: hex });   // ⑤ red/blue/black（''＝読めず）
      });
      kgOrder.forEach(function(nm){
        var kgv = kgAgg[nm]; if(!(kgv > 0)) return;
        kgv = Math.round(kgv*10)/10;
        orders.push({ cust:nm, bunrui:'', nyusu:1, qty:kgv, kg:Math.round(kgv), unit:'kg' });   // ④ kg単位（板側でkg表示）
      });
    }
    return {
      date: dstr,
      label: Utilities.formatDate(dt, CFG.TZ, 'M/d'),
      wday: wd[Utilities.formatDate(dt, CFG.TZ, 'u')],
      note: note,
      orders: orders
    };
  }

  // 今日から days 日分（既定3）
  var numDays = Math.max(1, Math.min(31, Number(params.days) || 3));
  var base = new Date(Utilities.formatDate(new Date(), CFG.TZ, 'yyyy/MM/dd') + ' 00:00:00');
  var days = [];
  for(var k = 0; k < numDays; k++){
    days.push(makeDay(new Date(base.getTime() + k*24*60*60*1000), notes[k] || ('+'+k+'日')));
  }

  // 指定日（範囲外なら追加表示）
  if(params.date){
    var dt2 = parseParamDate_(params.date);
    if(dt2){
      var dstr2 = Utilities.formatDate(dt2, CFG.TZ, 'yyyy/M/d');
      var exists = days.some(function(d){ return d.date === dstr2; });
      if(!exists) days.push(makeDay(dt2, '指定日'));
    }
  }
  if(params.noMarkNew) return { days: days, cols: cols.length };   // ⑤ 診断用（debugColors）はスナップショットを触らない
  nzMarkNew_(days);   // ③ 発注書の前回値と比べ、追加・数量変更された注文だけ isNew=true を付ける（全PC共通）
  return { days: days, cols: cols.length };
}

// ⑤ 文字色オブジェクト→'#rrggbb'（テーマ色はスプレッドシートのテーマから実際の色に直す。分からなければ''）
var _NZ_THEME_MEMO_ = null;
function nzFontColorHex_(c){
  try{
    if(!c) return '';
    var t = c.getColorType();
    if(t === SpreadsheetApp.ColorType.RGB) return c.asRgbColor().asHexString();
    if(t === SpreadsheetApp.ColorType.THEME){
      if(!_NZ_THEME_MEMO_) _NZ_THEME_MEMO_ = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSpreadsheetTheme();
      return _NZ_THEME_MEMO_.getConcreteColor(c.asThemeColor().getThemeColorType()).asRgbColor().asHexString();
    }
  }catch(e){}
  return '';
}
// '#rrggbb' → 'red'（赤系）／'blue'（青系）／'black'（それ以外＝黒・灰色・既定色）
//   ⚠広島の実データでは黒が '#ff000000'（先頭2桁＝不透明度の8桁）で返った。8桁は先頭2桁を捨てる（そのまま読むと黒が赤に化ける）。
function nzColorClass_(hex){
  var s = String(hex || '').replace(/^#/, '');
  if(/^[0-9a-f]{8}$/i.test(s)) s = s.slice(2);
  var m = s.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if(!m) return 'black';
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  if(r >= 140 && r - g >= 60 && r - b >= 60) return 'red';
  if(b >= 120 && b - r >= 60 && b - g >= 20) return 'blue';
  return 'black';
}
// ⑤ 診断用：?type=debugColors&date=2026-10-03（省略＝今日）→ 注文ごとの文字色と判定。読み取りのみ。
function debugColors_(params){
  params = params || {};
  var r = getNizukuri_({ days: 1, date: params.date, noMarkNew: true });
  if(r.error) return r;
  var want = params.date ? Utilities.formatDate(parseParamDate_(params.date), CFG.TZ, 'yyyy/M/d') : r.days[0].date;
  var day = r.days.filter(function(d){ return d.date === want; })[0] || r.days[0];
  return { date: day.date, orders: day.orders.map(function(o){
    return { cust:o.cust, bunrui:o.bunrui, nyusu:o.nyusu, qty:o.qty, colorHex:o.colorHex, color:o.color }; }) };
}

// ============================================================
// ③ NEW判定（サーバ側スナップショット）
//   前回の発注書の値を「荷造りスナップショット」シート（力量表SS内）に保存し、
//   今回の各注文と比較して「新規追加」または「数量変更」された行だけ isNew=true にする。
//   ・検知した日時(changedAt)をシートに記録 → 検知から NZ_NEW_MS(12時間)以内なら全PCで NEW 表示。
//   ・初回（スナップショットが空）は基準値を記録するだけで NEW にしない（全部NEWを防ぐ）。
//   ・キー＝日付|取引先|区分|入数（黒板側の状態保存キーと同じ）。7日より前の日付キーは掃除。
//   シート列：A=キー / B=舟数(qty) / C=変更検知日時(ISO) / D=表示用メモ
// ============================================================
function nzMarkNew_(days){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(15000); }catch(e){ return; }   // 取れなければNEW更新は諦める（表示は落とさない）
  try{
    var ss = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
    var name = CFG.NZ_SNAP_SHEET || '荷造りスナップショット';
    var sh = ss.getSheetByName(name);
    var firstEver = false;
    if(!sh){ sh = ss.insertSheet(name); sh.appendRow(['キー','舟数','変更検知日時','取引先・区分']); firstEver = true; }

    var data = sh.getDataRange().getValues();
    if(data.length <= 1) firstEver = true;
    var snap = {};   // key -> {qty, changedAt(ms), memo}
    for(var i = 1; i < data.length; i++){
      var k = String(data[i][0] || ''); if(!k) continue;
      var ca = data[i][2];
      var caMs = (ca instanceof Date) ? ca.getTime() : (ca ? Date.parse(ca) : 0);
      snap[k] = { qty: Number(data[i][1]) || 0, changedAt: caMs || 0, memo: String(data[i][3] || '') };
    }

    var now = Date.now();
    var newWindow = CFG.NZ_NEW_MS || (12*60*60*1000);
    var seen = {};
    days.forEach(function(d){
      (d.orders || []).forEach(function(o){
        var key = d.date + '|' + o.cust + '|' + (o.bunrui || '') + '|' + (o.nyusu || 0);
        seen[key] = true;
        var prev = snap[key];
        var changedAt;
        if(firstEver){
          changedAt = 0;                                   // 初回は基準化のみ＝NEWにしない
        }else if(!prev){
          changedAt = now;                                 // 新規追加
        }else if(prev.qty !== (o.qty || 0)){
          changedAt = now;                                 // 数量変更
        }else{
          changedAt = prev.changedAt || 0;                 // 変化なし＝前回の検知日時を維持
        }
        snap[key] = { qty: o.qty || 0, changedAt: changedAt, memo: o.cust + (o.bunrui ? '('+o.bunrui+')' : '') };
        o.isNew = !!(changedAt && (now - changedAt) < newWindow);
        o.changedAt = changedAt || 0;
      });
    });

    // 保存（7日より前の日付キーは掃除。キー先頭が yyyy/M/d）
    var cutoff = new Date(now - 8*24*60*60*1000);
    var out = [['キー','舟数','変更検知日時','取引先・区分']];
    Object.keys(snap).forEach(function(k){
      var p = k.split('|')[0].split('/');
      if(p.length === 3){ var dd = new Date(Number(p[0]), Number(p[1])-1, Number(p[2])); if(dd < cutoff) return; }
      var s = snap[k];
      out.push([k, s.qty, s.changedAt ? new Date(s.changedAt).toISOString() : '', s.memo]);
    });
    sh.clearContents();
    sh.getRange(1, 1, out.length, 4).setValues(out);
    sortSheetDescByHeader_(sh, '変更検知日時');   // 2026-09-03：常に変更検知日時の新しい順（降順）で並べ直す
  }catch(err){
    // 失敗してもNEW無しで表示は続ける
  }finally{
    try{ lock.releaseLock(); }catch(e){}
  }
}

// ============================================================
// ④ 発注書「発注書」メインシート → 資材管理アプリ（期間内の各SKU荷造数の合計）
//   ?type=shizaiUsage&start=2026-08-03&end=2026-08-06
//   返却： { asOf, start, end, count, rows:[ {tori, kubun, irisu, funes}, ... ] }
//   ・SKU＝取引先×区分×入数。区分は生の値（土なし等も正規化しない＝アプリのSKUキーに合わせる）。
//   ・除外：集計/舟数/追い送り/合計/ﾜﾝﾍﾞｼﾞ/個人/サンプル（NZ_EXCLUDE_RE）。
//   ・funes＝期間内(start〜end)の荷造数の合計（その列×各日の値の総和）。
//   ・kg入力の列（個人等）は上の除外に含む＝v1では対象外（必要になったら別途対応）。
// ============================================================
function getShizaiUsage_(params){
  params = params || {};
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  if(!sh) return { error:'シート「発注書」が見つかりません' };
  var v = sh.getDataRange().getValues();

  // 取引先行＝B列(index1)が西暦の行
  var nameRow = -1;
  for(var r = 0; r < Math.min(v.length, 15); r++){ var y = Number(v[r][1]); if(y>=2000&&y<=2100){ nameRow=r; break; } }
  if(nameRow < 0) return { error:'取引先行が見つかりません' };
  var nyusuRow   = nameRow + 2;   // 9行目
  var kubunLeft  = nameRow + 1;   // 8行目（C〜Q列＝index2〜16）
  var kubunRight = nameRow - 3;   // 4行目（R列〜＝index17〜）

  // 日付列＝Date型が最多の列（先頭6列から）
  var dateCol = 1, best = -1;
  for(var c0 = 0; c0 < 6; c0++){ var cnt=0; for(var rr=nameRow+3; rr<v.length; rr++){ if(v[rr][c0] instanceof Date) cnt++; } if(cnt>best){ best=cnt; dateCol=c0; } }

  // 期間（start省略＝全期間、end省略＝今日まで）
  var start = params.start ? parseParamDate_(params.start) : null;
  var end   = params.end   ? parseParamDate_(params.end)   : new Date();
  var startMs = start ? start.getTime() : -Infinity;
  var endDay  = end ? new Date(Utilities.formatDate(end, CFG.TZ, 'yyyy/MM/dd') + ' 23:59:59') : new Date();
  var endMs   = endDay.getTime();
  // 未来分（end翌日〜horizon日先）を日別に収集して「在庫切れ予定日」の算出に使う
  var horizon = params.horizonDays ? Number(params.horizonDays) : 90;
  var futureLimit = endMs + horizon*86400000;

  // 取引先の列メタ（集計・ﾜﾝﾍﾞｼﾞ・個人サンプルは除外）。区分は生の値（正規化しない）
  var cols = [], lastName = '';
  for(var c = 2; c < v[nameRow].length; c++){
    var nm = String(v[nameRow][c] || '').replace(/\n/g,' ').trim();
    if(nm) lastName = nm;
    var name = lastName;
    if(!name || NZ_EXCLUDE_RE.test(name)) continue;
    var nyusu = Number(v[nyusuRow][c]);
    if(!(nyusu > 0)) continue;                                  // 入数が数値の列＝取引先列のみ
    var flag8 = String(v[kubunLeft][c] || '').trim();
    if(flag8 === 'ﾜﾝﾍﾞｼﾞ' || flag8 === 'ワンベジ') continue;
    // 区分＝C〜Q(≤16)は8行目 / R〜は4行目（空なら8行目）。土なし等はそのまま（アプリのSKUに合わせる）
    var kubun = String((c <= 16 ? v[kubunLeft][c] : (v[kubunRight][c] || v[kubunLeft][c])) || '').trim();
    if(!kubun || kubun === '下茹で') continue;   // 区分空欄・下茹では対象外（ﾜﾝﾍﾞｼﾞと同様）
    cols.push({ c:c, tori:name, irisu:nyusu, kubun:kubun, sum:0, future:[] });
  }

  // 日付行を走査：期間内(start〜end)は合算／end翌日〜horizonは日別に収集
  for(var r2 = nameRow+3; r2 < v.length; r2++){
    var d = v[r2][dateCol];
    if(!(d instanceof Date)) continue;
    var t = d.getTime();
    var inPast   = (t >= startMs && t <= endMs);
    var inFuture = (t > endMs && t <= futureLimit);
    if(!inPast && !inFuture) continue;
    var dstr = Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');
    for(var i = 0; i < cols.length; i++){
      var q = Number(v[r2][cols[i].c]);
      if(!(q > 0)) continue;
      if(inPast)   cols[i].sum += q;
      if(inFuture) cols[i].future.push([dstr, q]);
    }
  }

  // 同一キー（取引先×区分×入数）の列が複数あれば合算（過去sum＋未来日別）
  var agg = {}, order = [], futAgg = {};
  cols.forEach(function(x){
    var key = x.tori + '|' + x.kubun + '|' + x.irisu;
    if(!agg[key]){ agg[key] = { tori:x.tori, kubun:x.kubun, irisu:x.irisu, funes:0 }; order.push(key); }
    agg[key].funes += x.sum;
    if(x.future && x.future.length){
      if(!futAgg[key]) futAgg[key] = { tori:x.tori, kubun:x.kubun, irisu:x.irisu, days:{} };
      x.future.forEach(function(p){ futAgg[key].days[p[0]] = (futAgg[key].days[p[0]]||0) + p[1]; });
    }
  });
  var rows = order.map(function(k){ return agg[k]; });
  var future = Object.keys(futAgg).map(function(k){
    var f = futAgg[k];
    return { tori:f.tori, kubun:f.kubun, irisu:f.irisu,
      days: Object.keys(f.days).sort().map(function(d){ return [d, f.days[d]]; }) };
  });
  return {
    asOf:  Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'),
    start: start ? Utilities.formatDate(start, CFG.TZ, 'yyyy-MM-dd') : null,
    end:   Utilities.formatDate(endDay, CFG.TZ, 'yyyy-MM-dd'),
    count: rows.length,
    rows:  rows,
    future: future                     // 各SKUの end翌日〜horizon の日別予定荷造数 [[YYYY-MM-DD, qty],...]
  };
}

// '8/10' / '2026/8/10' / '2026-08-10' → Date（年省略は今年）
function parseParamDate_(s){
  s = String(s || '').trim();
  if(!s) return null;
  var p = s.split(/[\/\-]/).map(Number);
  var y, m, d;
  if(p.length === 3){ y = p[0]; m = p[1]; d = p[2]; }
  else if(p.length === 2){ y = Number(Utilities.formatDate(new Date(), CFG.TZ, 'yyyy')); m = p[0]; d = p[1]; }
  else return null;
  if(!m || !d) return null;
  return new Date(y + '/' + ('0'+m).slice(-2) + '/' + ('0'+d).slice(-2) + ' 00:00:00');
}

var KUBUN_WORDS_ = { '真空':1, '洗い':1, '土付き':1, '下茹で':1, '土なし':1 };

// 指定行の荷造りデータを組み立て
function buildOrders_(v, row, blocks, maps){
  var orders = [];
  blocks.forEach(function(b){
    var key = b.cust + '|' + b.nyusu;
    if(maps.wanbeji[key]) return;   // ﾜﾝﾍﾞｼﾞは本日荷造りに出さない
    // 非表示グループ（個人＋サンプル等）は出さない
    var hg = CFG.HIDE_GROUPS || [];
    for(var hi=0; hi<hg.length; hi++){ if(b.group && b.group.indexOf(hg[hi]) >= 0) return; }

    // 荷造数は「入数列（=packedCol-1）」にその日の数量が入る。残数はpackedCol+1（マイナス表記）。
    var qty    = Number(v[row][b.packedCol - 1]) || 0;                       // 荷造数(c/s)
    var remain = b.remainCol >= 0 ? (Number(v[row][b.remainCol]) || 0) : 0;  // 残数
    if(qty <= 0) return;   // その日の荷造りが無い

    // 区分：①入数一致 → ②取引先名だけで一致（別サイズの区分を流用）
    var cust = b.cust, bunrui = maps.kubun[key] || maps.byName[b.cust] || '';
    if(KUBUN_WORDS_[b.cust]){ bunrui = bunrui || (b.cust==='土なし'?'洗い':b.cust); cust = b.group || b.cust; }

    // 名前の上書き（進捗シートの取引先行が空欄/古い箇所の補正）→ 区分も正しい名前で引き直す
    var ov = (CFG.NAME_OVERRIDE || {})[cust + '|' + b.nyusu];
    if(ov){ cust = ov; bunrui = maps.kubun[ov + '|' + b.nyusu] || maps.byName[ov] || bunrui; }

    // ③それでも空なら既定（洗い）
    if(!bunrui) bunrui = CFG.DEFAULT_BUNRUI || '';

    orders.push({
      cust: cust, bunrui: bunrui, group: b.group,
      nyusu: b.nyusu, qty: qty, remain: remain,
      kg: Math.round(qty * b.nyusu)
    });
  });
  return orders;
}

// 発注書メインシート「発注書」から 取引先|入数 → {区分, ﾜﾝﾍﾞｼﾞ判定} のマップを作る
//   取引先＝7行目 / 入数＝9行目 / 区分＝C〜Q列は8行目・R列〜は4行目（土なし＝洗い）
//   ﾜﾝﾍﾞｼﾞ判定＝8行目が「ﾜﾝﾍﾞｼﾞ」なら本日荷造りから除外
function getKubunMap_(){
  var kubun = {}, byName = {}, wanbeji = {};
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  if(!sh) return { kubun:kubun, byName:byName, wanbeji:wanbeji };
  var v = sh.getDataRange().getValues();
  // 取引先行＝B列(index1)が西暦の行
  var nameRow = -1;
  for(var r = 0; r < Math.min(v.length, 12); r++){
    var y = Number(v[r][1]); if(y >= 2000 && y <= 2100){ nameRow = r; break; }
  }
  if(nameRow < 0) return { kubun:kubun, byName:byName, wanbeji:wanbeji };
  var nyusuRow    = nameRow + 2;   // 9行目
  var kubunLeft   = nameRow + 1;   // 8行目（C〜Q列＝index2〜16／R列〜はﾜﾝﾍﾞｼﾞ等のフラグ）
  var kubunRight  = nameRow - 3;   // 4行目（R列〜の区分＝index17〜）
  var lastName = '';
  for(var c = 2; c < v[nameRow].length; c++){
    var nm = String(v[nameRow][c] || '').replace(/\n/g, ' ').trim();
    if(nm) lastName = nm;               // 取引先名は空欄なら直前を引き継ぐ（サイズ違いの列）
    var name = lastName;
    if(!name) continue;
    var nyusu = Number(v[nyusuRow][c]) || 0;
    if(!nyusu) continue;                // 入数の無い列（スペーサー）は無視
    var key = name + '|' + nyusu;
    var k = String((c <= 16 ? v[kubunLeft][c] : (kubunRight>=0 ? v[kubunRight][c] : '')) || '').trim();
    if(k === '土なし') k = '洗い';
    if(k){ kubun[key] = k; if(!byName[name]) byName[name] = k; }  // 取引先名だけの区分（最初に見つかった非空）
    // 8行目が ﾜﾝﾍﾞｼﾞ／ワンベジ なら除外フラグ
    var r8 = String(v[kubunLeft][c] || '').trim();
    if(r8 === 'ﾜﾝﾍﾞｼﾞ' || r8 === 'ワンベジ') wanbeji[key] = true;
  }
  return { kubun:kubun, byName:byName, wanbeji:wanbeji };
}

// ============================================================
// 構造確認用：各シートの先頭数行を返す（?type=debug）
// この結果を貼ってもらえれば、力量表・進捗の列マッピングを確定できます
// ============================================================
// エディタから▶実行して、ログに各シートの先頭を出す（構造確認用）
function showDebug(){
  Logger.log(JSON.stringify(debugTop_(), null, 2));
}

// ▼URL不要のテスト：エディタで関数を選んで▶実行 → ログ(Ctrl+Enter)を確認
function testShift(){    Logger.log(JSON.stringify(getShift_(),    null, 2)); }
function testHaichi(){   Logger.log(JSON.stringify(getHaichi_(),   null, 2)); }
function testNizukuri(){ Logger.log(JSON.stringify(getNizukuri_(), null, 2)); }
function testSummary(){  Logger.log(JSON.stringify(getSummary_({}), null, 2)); }   // 本日舟数(発注書「収穫舟数」列)＋実績(実績シート)を確認
// 資材管理アプリ用：期間を指定して各SKUの荷造数合計を確認（8/3〜8/6の例）
function testShizaiUsage(){ Logger.log(JSON.stringify(getShizaiUsage_({ start:'2026-08-03', end:'2026-08-06' }), null, 2)); }

// 進捗シート：各ブロックの取引先＋区分候補（4行目・8行目）を出す
function testNizukuriBlocks(){
  var v = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET).getDataRange().getValues();
  var custRow = -1;
  for(var r=0;r<Math.min(v.length,15);r++){ var y=Number(v[r][0]); if(y>=2000&&y<=2100){custRow=r;break;} }
  var subRow = custRow + 1;
  function cell(r,c){ if(r<0||r>=v.length||c<0) return ''; return String(v[r][c]||'').replace(/\n/g,' ').trim(); }
  function colLetter(n){ var s=''; n++; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; } // 0→A
  var labels = [];
  for(var c=1;c<v[subRow].length;c++){
    if(String(v[subRow][c]).indexOf('荷造数')>=0){
      labels.push({
        列: colLetter(c-1),                 // 取引先セルの列（A,B,...）
        取引先: cell(custRow, c-1),
        入数: cell(subRow, c-1),
        row4: cell(3, c-1),                 // 4行目(index3)の値
        row8: cell(7, c-1)                  // 8行目(index7)の値
      });
    }
  }
  Logger.log('custRow(index)=' + custRow + '  ブロック数=' + labels.length);
  Logger.log(JSON.stringify(labels, null, 2));
}

// 本日〜翌々日の行で「数字が入っているセル」を取引先付きで出す（値のズレ調査用）
function testNizukuriToday(){
  var v = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET).getDataRange().getValues();
  var custRow = -1;
  for(var r=0;r<Math.min(v.length,15);r++){ var y=Number(v[r][0]); if(y>=2000&&y<=2100){custRow=r;break;} }
  var subRow = custRow + 1;
  function colLetter(n){ var s=''; n++; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; }
  // 列→取引先 の対応（荷造数列＝取引先、残数列＝取引先(残)）
  var colCust = {}, lastCust='';
  for(var c=1;c<v[subRow].length;c++){
    if(String(v[subRow][c]).indexOf('荷造数')>=0){
      var nm=String(v[custRow][c-1]||'').replace(/\n/g,' ').trim(); if(nm) lastCust=nm;
      colCust[c]=lastCust;
      if(String(v[subRow][c+1]||'').indexOf('残数')>=0) colCust[c+1]=lastCust+'(残)';
    }
  }
  // 日付→行
  var rowByDate={};
  for(var r2=subRow+1;r2<v.length;r2++){ var d=v[r2][0]; if(d instanceof Date) rowByDate[Utilities.formatDate(d,CFG.TZ,'yyyy/M/d')]=r2; }
  var base=new Date(Utilities.formatDate(new Date(),CFG.TZ,'yyyy/MM/dd')+' 00:00:00');
  for(var k=0;k<3;k++){
    var dt=new Date(base.getTime()+k*86400000);
    var dstr=Utilities.formatDate(dt,CFG.TZ,'yyyy/M/d');
    var row=(dstr in rowByDate)?rowByDate[dstr]:-1;
    if(row<0){ Logger.log(dstr+' : 行なし'); continue; }
    var raw=[];
    for(var c2=1;c2<v[row].length;c2++){ var x=v[row][c2]; if(typeof x==='number' && x!==0) raw.push(colLetter(c2)+'['+(colCust[c2]||'?')+']='+x); }
    Logger.log(dstr+' (row'+(row+1)+') : ' + (raw.length?raw.join(', '):'（数値なし）'));
  }
}

// 本日値が入っている列の「縦の中身（1〜9行目）」を出す（取引先名の在り処探し）
function testNizukuriNames(){
  var v = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET).getDataRange().getValues();
  var custRow = -1;
  for(var r=0;r<Math.min(v.length,15);r++){ var y=Number(v[r][0]); if(y>=2000&&y<=2100){custRow=r;break;} }
  var subRow = custRow + 1;
  function colLetter(n){ var s=''; n++; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; }
  var rowByDate={};
  for(var r2=subRow+1;r2<v.length;r2++){ var d=v[r2][0]; if(d instanceof Date) rowByDate[Utilities.formatDate(d,CFG.TZ,'yyyy/M/d')]=r2; }
  var todayStr=Utilities.formatDate(new Date(),CFG.TZ,'yyyy/M/d');
  var row=(todayStr in rowByDate)?rowByDate[todayStr]:-1;
  if(row<0){ Logger.log('本日行なし'); return; }
  Logger.log('本日='+todayStr);
  for(var c=1;c<v[row].length;c++){
    var x=v[row][c];
    if(typeof x==='number' && x>0){   // 荷造数が入っている列
      var strip=[];
      for(var rr=0; rr<=8; rr++){ strip.push(String(v[rr][c]||'').replace(/\n/g,' ').trim()); }
      Logger.log(colLetter(c)+' ='+x+'  縦[1-9行]: '+JSON.stringify(strip));
    }
  }
}

// 発注書メインシートの日別データ構造を確認（本日〜翌々日の各列：取引先/区分/入数/値）
function testOrderMainDaily(){
  var v = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書').getDataRange().getValues();
  function colLetter(n){ var s=''; n++; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; }
  // 取引先行＝B列(index1)が西暦の行
  var nameRow=-1; for(var r=0;r<Math.min(v.length,15);r++){ var y=Number(v[r][1]); if(y>=2000&&y<=2100){nameRow=r;break;} }
  var nyusuRow=nameRow+2, kubunLeft=nameRow+1, kubunRight=nameRow-3;
  // 日付列＝Date型が最も多い列（先頭6列から）
  var dateCol=-1, best=-1;
  for(var c=0;c<6;c++){ var cnt=0; for(var r2=nameRow+3;r2<v.length;r2++){ if(v[r2][c] instanceof Date) cnt++; } if(cnt>best){best=cnt;dateCol=c;} }
  // 日付→行
  var rowByDate={};
  for(var r3=nameRow+3;r3<v.length;r3++){ var d=v[r3][dateCol]; if(d instanceof Date) rowByDate[Utilities.formatDate(d,CFG.TZ,'yyyy/M/d')]=r3; }
  Logger.log('nameRow(index)='+nameRow+' 日付列='+colLetter(dateCol));
  var base=new Date(Utilities.formatDate(new Date(),CFG.TZ,'yyyy/MM/dd')+' 00:00:00');
  var lastName='';
  function nameAt(c){ /* row7を左から引き継ぎ */ var s=''; for(var cc=2;cc<=c;cc++){ var nm=String(v[nameRow][cc]||'').replace(/\n/g,' ').trim(); if(nm) s=nm; } return s; }
  for(var k=0;k<3;k++){
    var dt=new Date(base.getTime()+k*86400000);
    var dstr=Utilities.formatDate(dt,CFG.TZ,'yyyy/M/d');
    var row=(dstr in rowByDate)?rowByDate[dstr]:-1;
    if(row<0){ Logger.log(dstr+' : 行なし'); continue; }
    var out=[];
    for(var c2=2;c2<v[row].length;c2++){
      var x=v[row][c2];
      if(typeof x==='number' && x>0){
        var kubun=String((c2<=16? v[kubunLeft][c2] : v[kubunRight][c2])||'').trim(); if(kubun==='土なし')kubun='洗い';
        out.push(colLetter(c2)+' '+nameAt(c2)+'/'+kubun+'/'+(v[nyusuRow][c2]||'')+' ='+x);
      }
    }
    Logger.log(dstr+' (row'+(row+1)+'):\n  '+out.join('\n  '));
  }
}

// 発注書メインシート「発注書」の上部を覗く（区分と取引先の対応確認用）
function testOrderMainRows(){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName('発注書');
  var rows = Math.min(10, sh.getLastRow());
  var cols = Math.min(30, sh.getLastColumn());   // A〜AD
  var v = sh.getRange(1,1,rows,cols).getValues();
  function colLetter(n){ var s=''; n++; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; }
  var head = []; for(var c=0;c<cols;c++) head.push(colLetter(c));
  Logger.log('列: ' + head.join(','));
  for(var r=0;r<rows;r++){
    Logger.log((r+1) + '行目: ' + JSON.stringify(v[r].map(function(x){ return (x instanceof Date)?'📅':String(x||'').replace(/\n/g,' ').trim(); })));
  }
}

function debugTop_(){
  function top(id, sheet){
    try{
      var sh = SpreadsheetApp.openById(id).getSheetByName(sheet);
      if(!sh) return { error:'シート「'+sheet+'」なし' };
      var rng = sh.getRange(1,1, Math.min(8, sh.getLastRow()), Math.min(12, sh.getLastColumn()));
      return rng.getValues();
    }catch(err){ return { error:String(err.message||err) }; }
  }
  return {
    shiftSheetName: shiftSheetName_(new Date()),
    order_進捗: top(CFG.ORDER_SS_ID, CFG.ORDER_SHEET),
    skill_力量表: top(CFG.SKILL_SS_ID, CFG.SKILL_SHEET),
    shift: top(CFG.SHIFT_SS_ID, shiftSheetName_(new Date()))
  };
}

// ============================================================
// 2026-09-03：電子黒板・資材アプリの状態/バックアップ用シートを「力量表」スプレッドシートから
// 新しい専用スプレッドシート（CFG.BOARD_DATA_SS_ID＝【センターDX】電子黒板データ保管庫）へ分離。
//   ★力量表SSに残すのは「力量表」「配置優先」の2枚だけ。それ以外（下のNAMES）は今後すべて新SSに書く。
//   ・このコードは"これから書く先"を切り替えるだけなので、力量表SSに残っている古いシートの中身は
//     何も変更・削除しない（そのまま残る＝過去ログとして参照可能）。
//   ・「本日荷造り状態」「配置設定」「資材データ」は"今日時点の生きた状態"を1個のJSONで持っているため、
//     何もしないと切替直後だけ空（未確定/初期状態）に見えてしまう。これを防ぐため、
//     力量表SS側に残っている最新の内容を新SSへ一度だけコピーする。
//   ・実行方法＝Apps Scriptエディタでこの関数を選んで▶実行を1回だけ。実行後にログ（表示→ログ）で
//     各シートが「コピー済み／既にデータあり(スキップ)／元シート無し」のどれだったか確認できる。
// ============================================================
function migrateBoardDataToNewSpreadsheet(){
  var oldSs = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
  var newSs = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var log = [];

  // ①行データ系シート：力量表SS側にあって新SS側にまだ無い行だけをマージで追加する（行の内容が完全一致する
  //   ものは重複させない）。
  //   ★2026-09-03当初は「新SS側に1行でもあれば全部スキップ」という単純な判定だったため、GAS再デプロイ後の
  //     通常運用で新SS側に当日分の行が書き込まれてしまうと、力量表側に残っている過去分が二度とコピー
  //     されない不具合があった（実際に発生：圃場舟数・生産者記録・荷造りスナップショットが本日分だけに
  //     なっていた）。→ 行ごとに内容を比較し、新SS側に無い行だけ追加するマージ方式に修正。
  //   ・再実行しても安全＝前回追加した行はすでに新SS側にあるので「追加分無し」になるだけ（重複しない）。
  var ROW_SHEETS = [
    { name: CFG.JISSEKI_SHEET       || '実績',                  header: null },
    { name: CFG.HOJO_SHEET          || '圃場舟数',               header: '更新日時' },
    { name: CFG.SEISAN_SHEET        || '生産者記録',             header: '更新日時' },
    { name: CFG.NZ_SNAP_SHEET       || '荷造りスナップショット', header: '変更検知日時' },
    { name: CFG.POSITION_SHEET      || 'ポジション履歴',         header: '保存日時' },
    { name: CFG.NZ_TEST_SHEET       || '本日荷造り進捗(テスト)', header: '更新日時' },
    { name: CFG.SHIZAI_BACKUP_SHEET || '資材バックアップ',       header: '保存日時' },
    { name: CFG.SHIZAI_STOCK_SHEET  || '月末棚卸（実数）',       header: null }
  ];
  ROW_SHEETS.forEach(function(t){
    var name = t.name;
    var oldSh = oldSs.getSheetByName(name);
    if(!oldSh){ log.push(name + '：力量表SS側に元シート無し（対応不要）'); return; }
    var oldV = oldSh.getDataRange().getValues();
    if(oldV.length <= 1){ log.push(name + '：力量表SS側にデータ無し（対応不要）'); return; }
    var header = oldV[0];
    var newSh = newSs.getSheetByName(name);
    if(!newSh){ newSh = newSs.insertSheet(name); newSh.appendRow(header); }
    var newV = newSh.getDataRange().getValues();
    var existing = {};
    for(var i = 1; i < newV.length; i++){ existing[JSON.stringify(newV[i])] = true; }
    var toAdd = [];
    for(var j = 1; j < oldV.length; j++){
      var key = JSON.stringify(oldV[j]);
      if(!existing[key]) toAdd.push(oldV[j]);
    }
    if(toAdd.length === 0){ log.push(name + '：新SS側に既に同じ内容あり（追加分無し）'); return; }
    var merged = [ newV.length ? newV[0] : header ].concat(toAdd, newV.slice(1));
    var width = merged[0].length;
    newSh.clear();
    newSh.getRange(1, 1, merged.length, width).setValues(merged.map(function(r){
      var a = r.slice(0, width); while(a.length < width) a.push(''); return a;
    }));
    if(t.header) sortSheetDescByHeader_(newSh, t.header);
    log.push(name + '：力量表SS側から' + toAdd.length + '行を追加しました（新SS内合計' + (merged.length - 1) + '行）');
  });

  // ②「今日時点の状態」を1個のJSONで持つシート（rev/savedAt/savedBy/json の4行構成）
  var STATE_SHEETS = [
    CFG.HAICHI_CFG_SHEET || '配置設定',
    CFG.NZ_STATE_SHEET   || '本日荷造り状態',
    CFG.SHIZAI_SHEET     || '資材データ'
  ];
  STATE_SHEETS.forEach(function(name){
    var oldSh = oldSs.getSheetByName(name);
    if(!oldSh){ log.push(name + '：元シート無し（未使用のためスキップ）'); return; }
    var newSh = newSs.getSheetByName(name);
    if(newSh && String(newSh.getRange('B4').getValue()||'') !== ''){ log.push(name + '：新SSに既にデータあり（スキップ）'); return; }
    var v = oldSh.getRange(1,1,Math.max(oldSh.getLastRow(),4), Math.max(oldSh.getLastColumn(),2)).getValues();
    if(!newSh) newSh = newSs.insertSheet(name);
    newSh.getRange(1,1,v.length,v[0].length).setValues(v);
    log.push(name + '：現在の状態をコピーしました（rev=' + v[0][1] + '）');
  });

  Logger.log(log.join('\n'));
  return log;
}

// ============================================================
// 2026-09-03：既存データを一度だけ「更新日時（相当の列）」の降順に並べ替える（曽我さん依頼③）。
//   ・今後の新規保存は各保存関数に組み込んだ sortSheetDescByHeader_ で自動的に降順を維持する。
//   ・この関数は、それより前に書き込まれた“既に並び順がバラバラな”データを1回だけ整える。
//   ・実行方法＝Apps Scriptエディタでこの関数を選んで▶実行を1回だけ。
// ============================================================
function sortAllBoardDataSheetsOnce(){
  var boardSs = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var TARGETS = [
    { sheet: CFG.HOJO_SHEET          || '圃場舟数',              header: '更新日時' },
    { sheet: CFG.SEISAN_SHEET        || '生産者記録',            header: '更新日時' },
    { sheet: CFG.NZ_SNAP_SHEET       || '荷造りスナップショット', header: '変更検知日時' },
    { sheet: CFG.POSITION_SHEET      || 'ポジション履歴',        header: '保存日時' },
    { sheet: CFG.NZ_TEST_SHEET       || '本日荷造り進捗(テスト)', header: '更新日時' },
    { sheet: CFG.SHIZAI_BACKUP_SHEET || '資材バックアップ',      header: '保存日時' }
  ];
  var log = [];
  TARGETS.forEach(function(t){
    var sh = boardSs.getSheetByName(t.sheet);
    if(!sh){ log.push(t.sheet + '：シート無し（スキップ）'); return; }
    sortSheetDescByHeader_(sh, t.header);
    log.push(t.sheet + '：並べ替えました（' + sh.getLastRow() + '行）');
  });
  // 発注書側の「生産者記録」（seisanOrderSheet_）も同様に整える。発注書スプレッドシートの他のシートには一切触れない。
  try{
    var orderSh = seisanOrderSheet_();
    sortSheetDescByHeader_(orderSh, '更新日時');
    log.push('発注書「生産者記録」：並べ替えました（' + orderSh.getLastRow() + '行）');
  }catch(e){ log.push('発注書「生産者記録」：エラー ' + e); }
  Logger.log(log.join('\n'));
  return log;
}

// ============================================================
// 2026-09-03：移行が完了した後、センター力量表スプレッドシートに残っている“もう使っていない”
// バックアップ/状態用シートを削除する（曽我さん依頼①）。
//   ★安全策＝各シートについて「新しいスプレッドシート（BOARD_DATA_SS_ID）側に十分なデータが
//     コピーされていること」を確認できたものだけ削除する。確認できないシートは削除せずログに残す。
//   ・「力量表」「配置優先」の2枚は削除対象に含まれていない（力量表本体と一体で使うため）。
//   ・実行方法＝migrateBoardDataToNewSpreadsheet を実行済みであることを確認してから、
//     Apps Scriptエディタでこの関数を選んで▶実行を1回だけ。
// ============================================================
function cleanupSkillSpreadsheet(){
  var oldSs = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
  var newSs = SpreadsheetApp.openById(CFG.BOARD_DATA_SS_ID);
  var log = [];

  // ①行データ系シート：新SS側に2行以上（ヘッダー＋データ1行以上）あれば移行済みとみなす
  var ROW_SHEETS = [
    CFG.JISSEKI_SHEET   || '実績',
    CFG.HOJO_SHEET      || '圃場舟数',
    CFG.SEISAN_SHEET    || '生産者記録',
    CFG.NZ_SNAP_SHEET   || '荷造りスナップショット',
    CFG.POSITION_SHEET  || 'ポジション履歴',
    CFG.NZ_TEST_SHEET   || '本日荷造り進捗(テスト)',
    CFG.SHIZAI_BACKUP_SHEET || '資材バックアップ',
    CFG.SHIZAI_STOCK_SHEET  || '月末棚卸（実数）'
  ];
  ROW_SHEETS.forEach(function(name){
    var oldSh = oldSs.getSheetByName(name);
    if(!oldSh){ log.push(name + '：力量表SSに元々無い（対応不要）'); return; }
    var newSh = newSs.getSheetByName(name);
    var oldRows = oldSh.getLastRow();
    if(oldRows <= 1){ oldSs.deleteSheet(oldSh); log.push(name + '：力量表SS側は元々データ無し→削除OK'); return; }
    if(!newSh || newSh.getLastRow() < oldRows){
      log.push(name + '：★削除せずスキップ（新SS側の行数(' + (newSh ? newSh.getLastRow() : 0) + ')が力量表SS側(' + oldRows + ')未満＝移行未確認）');
      return;
    }
    oldSs.deleteSheet(oldSh);
    log.push(name + '：新SS側に' + newSh.getLastRow() + '行あるのを確認→力量表SSから削除しました');
  });

  // ②「今日時点の状態」を1個のJSONで持つシート：新SS側のjson(B4)が空でなければ移行済みとみなす
  var STATE_SHEETS = [
    CFG.HAICHI_CFG_SHEET || '配置設定',
    CFG.NZ_STATE_SHEET   || '本日荷造り状態',
    CFG.SHIZAI_SHEET     || '資材データ'
  ];
  STATE_SHEETS.forEach(function(name){
    var oldSh = oldSs.getSheetByName(name);
    if(!oldSh){ log.push(name + '：力量表SSに元々無い（対応不要）'); return; }
    var newSh = newSs.getSheetByName(name);
    var oldJson = String(oldSh.getRange('B4').getValue() || '');
    if(oldJson === ''){ oldSs.deleteSheet(oldSh); log.push(name + '：力量表SS側は元々データ無し→削除OK'); return; }
    var newJson = newSh ? String(newSh.getRange('B4').getValue() || '') : '';
    if(newJson === ''){
      log.push(name + '：★削除せずスキップ（新SS側にまだ状態が無い＝移行未確認。migrateBoardDataToNewSpreadsheet を先に実行してください）');
      return;
    }
    oldSs.deleteSheet(oldSh);
    log.push(name + '：新SS側に状態があるのを確認→力量表SSから削除しました');
  });

  Logger.log(log.join('\n'));
  return log;
}
