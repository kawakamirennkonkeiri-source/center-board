/**
 * MD部お知らせ連携（Slack「お知らせ」チャンネル → 電子黒板）  ※承認なし・そのまま表示版
 * ㈱カワカミ蓮根 センターDX
 *
 * 仕組み（シンプル版）：
 *   電子黒板が数分ごとにこのGASを呼ぶ → GASがSlack「お知らせ」チャンネルの
 *   直近◯日分の投稿をその場で取得して返す → 黒板に「〇〇さんからのお知らせ」を表示。
 *   ・書いた内容はそのまま黒板に出る（承認ステップなし）。
 *   ・カードをクリックすると過去のお知らせも一覧で見られる（黒板側で表示）。
 *   ・先頭に【荷造り】が付いた投稿は、黒板の「本日荷造り」タブにも短い注意文が出る。
 *
 * 承認ページ・承認シート・毎朝トリガーは廃止。セットアップは3つだけ：
 *   ① スクリプトプロパティに SLACK_BOT_TOKEN と SLACK_CHANNEL_ID を登録
 *   ② ウェブアプリとしてデプロイ（次のユーザーとして実行＝自分／アクセス＝全員）
 *   ③ 出てきた /exec URL を 電子黒板イメージ.html の MD_NEWS_ENDPOINT に貼る
 *
 * 動作確認：エディタで testFetch を▶実行 → ログに取得件数と先頭が出る。
 */

// ===== 設定 =====
var SHOW_DAYS       = 14;            // 直近何日分を黒板に出すか
var TZ              = 'Asia/Tokyo';
var NIZUKURI_TAG_RE = /^\s*[【\[]\s*荷造り\s*[】\]]\s*/;  // 先頭の【荷造り】/[荷造り]
var FALLBACK_NAME   = 'お知らせ';    // 投稿者名が取れないときの差出人ラベル

function prop_(key){ return PropertiesService.getScriptProperties().getProperty(key) || ''; }

// ============================================================
// 電子黒板からの呼び出し（JSONP）  例: .../exec?callback=xxx
// ============================================================
function doGet(e){
  e = e || { parameter:{} };
  var items;
  try{ items = fetchRecentNotices_(); }
  catch(err){ items = { error:String((err && err.message) || err) }; } // 黒板側は配列でなければサンプル表示にフォールバック
  var payload = JSON.stringify(items);
  if(e.parameter.callback){
    return ContentService
      .createTextOutput(e.parameter.callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Slack「お知らせ」チャンネルの直近SHOW_DAYS分を取得し、黒板向け配列へ整形
//   返す各要素: { from, posted:'yyyy-MM-dd', time:'HH:mm', body, nizukuri:Boolean }
// ============================================================
function fetchRecentNotices_(){
  var token   = prop_('SLACK_BOT_TOKEN');
  var channel = prop_('SLACK_CHANNEL_ID');
  if(!token || !channel){
    throw new Error('SLACK_BOT_TOKEN / SLACK_CHANNEL_ID をスクリプトプロパティに設定してください');
  }

  var now    = new Date();
  var oldest = Math.floor((now.getTime() - SHOW_DAYS*24*60*60*1000)/1000); // UNIX秒

  var url = 'https://slack.com/api/conversations.history'
          + '?channel=' + encodeURIComponent(channel)
          + '&oldest='  + oldest
          + '&limit=200';
  var res = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{ Authorization:'Bearer ' + token },
    muteHttpExceptions:true
  });
  var data = JSON.parse(res.getContentText());
  if(!data.ok){
    throw new Error('Slack API エラー: ' + data.error
      + '（botをチャンネルに /invite したか、channels:history / groups:history 権限を確認）');
  }

  var out = [];
  (data.messages || []).forEach(function(m){
    // 参加通知・bot投稿・空文はスキップ（スレッド全体投稿だけは通す）
    if(m.subtype && m.subtype !== 'thread_broadcast') return;
    if(!m.text || !m.text.trim()) return;

    var raw  = cleanText_(m.text);
    var isNz = NIZUKURI_TAG_RE.test(raw);
    var body = isNz ? raw.replace(NIZUKURI_TAG_RE, '').trim() : raw;
    if(!body) return;

    var when = new Date(Number(m.ts) * 1000);
    out.push({
      from:     resolveUserName_(token, m.user),
      posted:   Utilities.formatDate(when, TZ, 'yyyy-MM-dd'),
      time:     Utilities.formatDate(when, TZ, 'HH:mm'),
      body:     body,
      nizukuri: isNz
    });
  });

  // 新しい順（同日は時刻の新しい順）
  out.sort(function(a,b){
    if(a.posted !== b.posted) return a.posted < b.posted ? 1 : -1;
    return a.time < b.time ? 1 : (a.time > b.time ? -1 : 0);
  });
  return out;
}

// Slackのメンション記法・装飾を軽く整形
function cleanText_(t){
  return String(t)
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, '$1')   // <url|表示名> → 表示名
    .replace(/<https?:\/\/[^>]+>/g, '')                // 裸URL除去
    .replace(/<@[A-Z0-9]+>/g, '@さん')                 // メンション
    .replace(/[*_~`]/g, '')                            // 装飾記号
    .trim();
}

// user_id → 表示名（6時間キャッシュ）
function resolveUserName_(token, userId){
  if(!userId) return FALLBACK_NAME;
  var cache = CacheService.getScriptCache();
  var hit = cache.get('u_' + userId);
  if(hit) return hit;
  try{
    var res = UrlFetchApp.fetch('https://slack.com/api/users.info?user=' + userId, {
      headers:{ Authorization:'Bearer ' + token }, muteHttpExceptions:true });
    var d = JSON.parse(res.getContentText());
    var name = FALLBACK_NAME;
    if(d.ok && d.user){
      var p = d.user.profile || {};
      name = p.display_name || d.user.real_name || p.real_name || d.user.name || FALLBACK_NAME;
    }
    cache.put('u_' + userId, name, 6*60*60);
    return name;
  }catch(err){ return FALLBACK_NAME; }
}

// ============================================================
// 動作確認用（エディタで▶実行してログを見る）
// ============================================================
function testFetch(){
  var items = fetchRecentNotices_();
  Logger.log('取得件数: ' + items.length);
  if(items.length) Logger.log(JSON.stringify(items[0], null, 2));
  return items;
}
