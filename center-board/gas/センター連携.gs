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
  POSITION_SHEET: 'ポジション履歴',   // 配置図の保存先シート（力量表と同じスプレッドシート内。無ければ自動作成）
  JISSEKI_SHEET:  '実績',            // 本日実績シート（力量表と同じスプレッドシート内。列＝日付/荷造り舟数/荷造りkg/歩留まり(%)）
  HOJO_SHEET:     '圃場舟数',        // ⑥ 圃場（畑）から持ってきた舟数の記録（力量表SS内。列＝日付/圃場/舟数/更新日時）
  SEISAN_SHEET:   '生産者記録',      // ⑥ 生産者の持ち込み舟数・出来高（力量表SS内。列＝日付/時間帯/生産者/区分/サイズkg/舟数/出来高kg/更新日時。実績数量には含めない）

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
  //   空欄のままなら SKILL_SS_ID（力量表のスプレッドシート）内に「資材データ」シートを自動作成して使う。
  SHIZAI_SS_ID: '',           // 別のスプレッドシートに保存したい時だけIDを入れる（空＝力量表SSを使う）
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
    else if(type === 'debug')    out = debugTop_();     // 構造確認用
    else out = { error:'type を shift / haichi / nizukuri / nizukuriStateGet / savePosition / summary / hojoGet / seisanGet / haichiCfgGet / gloveUsage / shizaiUsage / shizaiLoad / shizaiMeta / shizaiBackupList / shizaiBackupGet のいずれかで指定してください' };
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
  var id = CFG.SHIZAI_SS_ID || CFG.SKILL_SS_ID;
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
  var id = CFG.SHIZAI_SS_ID || CFG.SKILL_SS_ID;
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
  var id = CFG.SHIZAI_SS_ID || CFG.SKILL_SS_ID;
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
    sh.getRange(rr, col).setValue(r.actual);
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
  var out = { date: Utilities.formatDate(today, CFG.TZ, 'yyyy-MM-dd'), targetFunes: null, jisseki: { funes:null, kg:null, budomari:null }, orderTotalKg: null };
  try{ out.targetFunes = readOrderFunes_(today); }catch(e){ out.targetError = String(e); }
  try{ out.jisseki = readJisseki_(today); }catch(e){ out.jissekiError = String(e); }
  try{ out.orderTotalKg = readOrderProgressKg_(today); }catch(e){ out.orderTotalKgError = String(e); }
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
// 発注書「進捗」シートの「合計kg数」列（見出しで自動検出・列固定しない）× A列が今日の行の値。
//   ★ ここは電子黒板の「荷造りkg（実績）」と突き合わせて一致確認するための値。
//   ・列は固定しない：新規取引先が増えて列がズレても、見出し文字「合計kg数」（全角㎏表記も可）で探す（上から10行を走査）。
//   ・日付はA列（Date型）。テキスト形式で入っていた場合は拾えないので、その時はA列の書式を確認する。
function readOrderProgressKg_(today){
  var sh = SpreadsheetApp.openById(CFG.ORDER_SS_ID).getSheetByName(CFG.ORDER_SHEET);
  if(!sh) return null;
  var v = sh.getDataRange().getValues();

  // ① 「合計kg数」の見出しがある列を探す（全角㎏・半角kg・空白ゆれを吸収）
  var col = -1;
  for(var r=0; r<Math.min(v.length,10) && col<0; r++){
    for(var c=0; c<v[r].length; c++){
      var t = String(v[r][c]==null?'':v[r][c]).replace(/\s|　/g,'').replace(/㎏/g,'kg');
      if(t.indexOf('合計kg数')>=0){ col = c; break; }
    }
  }
  if(col < 0) return null;   // 見出しが見つからない（列名が変わったらここを直す）

  // ② 今日の行（A列＝日付）を探して、その列の値を返す
  var todayStr = Utilities.formatDate(today, CFG.TZ, 'yyyy/M/d');
  for(var r2=0; r2<v.length; r2++){
    var a = v[r2][0]; // A列
    if(a instanceof Date && Utilities.formatDate(a, CFG.TZ, 'yyyy/M/d') === todayStr){
      var val = v[r2][col];
      var n = (typeof val === 'number') ? val : Number(String(val).replace(/[^0-9.\-]/g,''));
      return isNaN(n) ? null : n;
    }
  }
  return null;
}
// 力量表スプレッドシート内「実績」シート（日付/荷造り舟数/荷造りkg/歩留まり）から今日の行
function readJisseki_(today){
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
    seisan:        safe(function(){ return seisanGet_({ date: hdate }); })
  };
}
// エディタから▶実行して、まとめ取得の中身を確認（各セクションがerror無く返るか）
function testBundle(){ Logger.log(JSON.stringify(getBundle_({ days: 3 }), null, 2)); }

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
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
//   ・seisanSave（POST）：{ action:'seisanSave', date, list:[{name,ampm,rows:{...}}] } → その日付を全入れ替え(upsert)
//   ※生産者ごとの記録用。電子黒板の実績数量には含めない。出来高kg＝舟数×サイズkg。
// ============================================================
function seisanSheet_(){
  var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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

    var data = sh.getDataRange().getValues();
    var kept = [ (data.length ? data[0] : HEAD) ];
    for(var i = 1; i < data.length; i++){
      var d0 = data[i][0];
      var dstr = (d0 instanceof Date) ? Utilities.formatDate(d0, CFG.TZ, 'yyyy-MM-dd') : String(d0).trim();
      if(dstr !== date) kept.push(data[i]);
    }
    var newRowsForDate = [];   // ⑥-b 発注書「生産者記録」へそのまま流す分（今回保存した、この日付の行だけ）
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
        kept.push(row); newRowsForDate.push(row);
        rowsN++; totalFunes += funes; totalKg += kg;
      });
      var pf = Number(p.funes) || 0;   // ③ 収穫舟数（板の舟数へ加算する値）＝区分「収穫舟数」の1行で保存
      if(pf > 0){ var pfRow = [date, ampm, name, '収穫舟数', 0, pf, 0, now]; kept.push(pfRow); newRowsForDate.push(pfRow); rowsN++; }
    });
    sh.clearContents();
    sh.getRange(1, 1, kept.length, HEAD.length).setValues(kept.map(function(r){
      var a = r.slice(0, HEAD.length); while(a.length < HEAD.length) a.push(''); return a;
    }));
    // ⑥-b 発注書「生産者記録」（新規シート）へも同じ内容を反映。失敗しても力量表側の保存自体は成立させる。
    try{ seisanPushToOrder_(date, newRowsForDate); }catch(e2){ Logger.log('seisanPushToOrder_ failed: ' + e2); }
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
  // 「センター合計人数」または「社員シフト」行より下は、〇でもセンター(現場)には入らない人たち
  //   （益田・古澤…等の社員シフト表／集計行）。ここから下は出勤者・ロスターに含めない。
  var centerEnded = false;
  for(var r = pos.row + 1; r < values.length; r++){
    var rowIsBoundary = values[r].some(function(x){
      var s = String(x); return s.indexOf('センター合計人数') >= 0 || s.indexOf('社員シフト') >= 0;
    });
    // 集計行「午前人数」「午後人数」を拾って本日列の値を採用（センター人数 AM/PM 用。境界より下でも拾う）
    for(var c = 0; c < values[r].length; c++){
      var label = String(values[r][c] || '').replace(/\s/g, '');
      if(!label) continue;
      if(label.indexOf('午前人数') >= 0){ var av = Number(values[r][pos.col]); if(!isNaN(av)) amCount = av; }
      if(label.indexOf('午後人数') >= 0){ var pv = Number(values[r][pos.col]); if(!isNaN(pv)) pmCount = pv; }
    }
    if(rowIsBoundary) centerEnded = true;   // この行以降はセンターメンバーに含めない
    var nm = String(values[r][nameCol] || '').trim();
    var cell = String(values[r][pos.col] || '').trim();
    // ★ 応援（34行目〜の「応援①」等）＝「センター合計人数」より下だが、本日〇なら現場に入れる。
    //   力量表には登録せず support として板へ渡し、板側でフレッシュ扱い＝基本「はつり」へ自動配置。
    //   氏名が「応援」で始まる行だけを対象にする（集計行に紛れないよう限定）。
    if(/^応援/.test(nm)){
      if(cell === CFG.MARK_PRESENT){ present.push(nm); support.push(nm); status[nm] = cell; }
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

    var acc = {};   // date → {total, noSize, bySize}
    dayCols.forEach(function(dc){ acc[dc.date] = { total:0, noSize:0, bySize:{} }; });

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
        if(size) a.bySize[size] = (a.bySize[size] || 0) + 1;
        else a.noSize++;
      });
    }
    dayCols.forEach(function(dc){
      var a = acc[dc.date];
      if(a.total > 0) days.push({ date:dc.date, total:a.total, bySize:a.bySize, noSize:a.noSize });
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
  var cols = [], byName = {}, lastName = '';
  var KG_GROUP_RE = /個人注文|その他サンプル/;   // ④ kg集計する特別グループ（除外せず、複数サブ列を合計）
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
    if(isKg){ cols.push({ c:c, name:name, nyusu:nyusu, kubun:'', kgUnit:true }); continue; }   // ④ kg列＝区分なし・kg単位（名前ごとに日別合計）
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

  function makeDay(dt, note){
    var dstr = Utilities.formatDate(dt, CFG.TZ, 'yyyy/M/d');
    var row  = (dstr in rowByDate) ? rowByDate[dstr] : -1;
    var orders = [];
    if(row >= 0){
      var kgAgg = {}, kgOrder = [];   // ④ 個人注文／その他サンプル：名前ごとに日別kgを合計して1行に
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
        orders.push({ cust:name, bunrui:bunrui, nyusu:col.nyusu, qty:qty, kg:Math.round(qty*col.nyusu) });
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
  nzMarkNew_(days);   // ③ 発注書の前回値と比べ、追加・数量変更された注文だけ isNew=true を付ける（全PC共通）
  return { days: days, cols: cols.length };
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
    var ss = SpreadsheetApp.openById(CFG.SKILL_SS_ID);
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
