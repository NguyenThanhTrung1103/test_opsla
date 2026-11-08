const ids = ["relayUrl", "token", "substackPub", "idleMinutes"];
const checks = ["allowPublish", "allowDev"];
chrome.storage.local.get([...ids, ...checks], (v) => {
  ids.forEach((k) => (document.getElementById(k).value = v[k] || ""));
  checks.forEach((k) => (document.getElementById(k).checked = !!v[k]));
});
const show = () => chrome.runtime.sendMessage("status", (s) => {
  document.getElementById("st").textContent = s?.connected ? `● connected (relay ${s.relayVersion || "?"})` : "○ disconnected " + (s?.lastError || "");
});
document.getElementById("save").onclick = async () => {
  const v = Object.fromEntries(ids.map((k) => [k, document.getElementById(k).value.trim()]));
  checks.forEach((k) => (v[k] = document.getElementById(k).checked));
  v.idleMinutes = Math.max(1, parseInt(v.idleMinutes, 10) || 5);
  await chrome.storage.local.set(v);
  chrome.runtime.sendMessage("reconnect", () => setTimeout(show, 1500));
};
show(); setInterval(show, 3000);
