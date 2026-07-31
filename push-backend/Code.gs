/**
 * Daily Tasks - Push notification backend (Google Apps Script)
 * ------------------------------------------------------------------
 * Chạy định kỳ (mỗi 1 phút) để kiểm tra công việc quá giờ rồi gửi
 * FCM push tới mọi thiết bị đã bật thông báo.
 *
 * CÁCH CÀI ĐẶT:
 * 1. Vào https://script.google.com → New project → dán toàn bộ file này.
 * 2. Điền SERVER_KEY (xem Firebase console → Project settings → Cloud Messaging
 *    → "Cloud Messaging API (Legacy)" → Server key). Nếu không thấy mục Legacy,
 *    bấm "Enable legacy" để kích hoạt.
 * 3. Chạy hàm setupTrigger() một lần (cấp quyền) để cài lịch chạy mỗi phút.
 * 4. (Tùy chọn) Chạy testSend(token) để kiểm tra token gửi được.
 */

var FB_BASE = "https://hagiang-planner-default-rtdb.firebaseio.com";
var SERVER_KEY = "AAAA__DIEN_SERVER_KEY__"; // Firebase → Cloud Messaging (Legacy) → Server key

var TZ = "Asia/Ho_Chi_Minh"; // Múi giờ Việt Nam

function getJson(path) {
  try {
    var r = UrlFetchApp.fetch(FB_BASE + path + ".json", { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    return JSON.parse(r.getContentText());
  } catch (e) {
    return null;
  }
}

function putJson(path, body) {
  try {
    UrlFetchApp.fetch(FB_BASE + path + ".json", {
      method: "put", muteHttpExceptions: true, contentType: "application/json",
      payload: JSON.stringify(body)
    });
  } catch (e) {}
}

function deleteNode(path) {
  try {
    UrlFetchApp.fetch(FB_BASE + path + ".json", {
      method: "delete", muteHttpExceptions: true
    });
  } catch (e) {}
}

/** Chuyển giờ Việt Nam (vnToday dạng yyyy-MM-dd + hh:mm) thành Date (UTC instant). */
function dueToDate(vnToday, hhmm) {
  var p = hhmm.split(":").map(Number);
  var y = parseInt(vnToday.slice(0, 4), 10);
  var mo = parseInt(vnToday.slice(5, 7), 10);
  var d = parseInt(vnToday.slice(8, 10), 10);
  return new Date(Date.UTC(y, mo - 1, d, p[0], p[1]) - 7 * 3600000);
}

/** Gửi push qua FCM legacy API. Trả về chuỗi phản hồi. */
function sendFcmLegacy(token, title, body, data) {
  var res = UrlFetchApp.fetch("https://fcm.googleapis.com/fcm/send", {
    method: "post", muteHttpExceptions: true, contentType: "application/json",
    headers: { Authorization: "key=" + SERVER_KEY },
    payload: JSON.stringify({
      to: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: { fcm_options: { link: "https://vuducvinh23021999-stack.github.io/daily-tracker/" } }
    })
  });
  return res.getResponseCode() + " " + res.getContentText();
}

/** Kiểm tra công việc quá giờ (chưa xong, hôm nay, quá giờ dưới 60 phút) rồi gửi push. */
function checkDueTasks() {
  if (SERVER_KEY.indexOf("DIEN_SERVER_KEY") >= 0) {
    console.error("Chưa điền SERVER_KEY trong Code.gs");
    return;
  }
  var push = getJson("/daily-tracker/_push");
  if (!push) return;
  var users = Object.keys(push);
  var now = Date.now();
  var today = Utilities.formatDate(new Date(now), TZ, "yyyy-MM-dd");
  var props = PropertiesService.getScriptProperties();
  var lastPush = {};
  try { lastPush = JSON.parse(props.getProperty("lastPush") || "{}"); } catch (e) {}

  users.forEach(function (u) {
    var tokObj = push[u] && push[u].tokens ? push[u].tokens : {};
    var tokens = Object.keys(tokObj).map(function (k) { return tokObj[k].token; })
      .filter(function (t) { return t && t.length > 20; });
    if (!tokens.length) return;

    var data = getJson("/daily-tracker/" + u);
    if (!data) return;

    var dueList = [];
    Object.keys(data).forEach(function (id) {
      var t = data[id];
      if (!t || t.done || !t.scheduledTime || t.date !== today) return;
      var dueMs = dueToDate(today, t.scheduledTime).getTime();
      var diff = now - dueMs;
      if (diff <= 0 || diff > 60 * 60000) return;
      var key = u + ":" + id;
      if (lastPush[key] && now - lastPush[key] < 10 * 60000) return;
      dueList.push({ id: id, key: key, t: t });
    });

    if (!dueList.length) return;
    dueList.sort(function (a, b) { return (a.t.scheduledTime || "9999").localeCompare(b.t.scheduledTime || "9999"); });
    var due = dueList[0];

    var catLabel = String(due.t.category || "other").replace(/_/g, " ");
    var title = "⏰ Đến giờ: " + due.t.title;
    var body = due.t.scheduledTime + " · " + catLabel;

    tokens.forEach(function (token) {
      var resp = sendFcmLegacy(token, title, body, { taskId: due.id, userId: u, scheduledTime: due.t.scheduledTime });
      // Nếu token không còn hợp lệ → xoá khỏi RTDB
      if (resp.indexOf("NotRegistered") >= 0 || resp.indexOf("InvalidRegistration") >= 0) {
        Object.keys(tokObj).forEach(function (dk) {
          if (tokObj[dk].token === token) deleteNode("/daily-tracker/_push/" + u + "/tokens/" + dk);
        });
      } else {
        console.log("Sent to " + u + ": " + resp.substring(0, 120));
      }
    });
    lastPush[due.key] = now;
    props.setProperty("lastPush", JSON.stringify(lastPush));
  });
}

/** Cài lịch chạy mỗi 1 phút. Gọi 1 lần duy nhất. */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger("checkDueTasks").timeBased().everyMinutes(1).create();
  Logger.log("Đã cài trigger mỗi phút.");
}

/** Gỡ toàn bộ trigger. */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  Logger.log("Đã gỡ trigger.");
}

/** Test thủ công: truyền 1 token FCM bất kỳ. */
function testSend(token) {
  var r = sendFcmLegacy(token, "⏰ Test Daily Tasks", "Thông báo thử nghiệm", {});
  Logger.log(r);
  return r;
}
