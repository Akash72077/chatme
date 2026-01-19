const socket = io();

/* ================= HELPERS ================= */
function getCountryFlag(country) {
  if (country === "India") return "🇮🇳";
  return "";
}

/* ================= COMMON ================= */
const onlineEl = document.getElementById("onlineCount");
if (onlineEl) {
  socket.on("onlineUsers", (count) => {
    onlineEl.innerText = count;
  });
}

/* ================= RULES (HOME PAGE) ================= */
const rulesModal = document.getElementById("rulesModal");
const acceptBtn = document.getElementById("acceptRules");

if (rulesModal && !sessionStorage.getItem("rulesAccepted")) {
  rulesModal.style.display = "flex";
} else if (rulesModal) {
  rulesModal.style.display = "none";
}

acceptBtn?.addEventListener("click", () => {
  sessionStorage.setItem("rulesAccepted", "yes");
  rulesModal.style.display = "none";
});

/* ================= HOME PAGE START ================= */
const startBtnHome = document.getElementById("startChat");
const usernameInput = document.getElementById("username");

startBtnHome?.addEventListener("click", () => {
  let username = usernameInput.value.trim();
  if (username === "") username = "Stranger";
  sessionStorage.setItem("username", username);
  window.location.href = "chat.html";
});

/* ================= CHAT PAGE ================= */
const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");
const actionBtn = document.getElementById("actionBtn"); // Start / Skip
const statusEl = document.getElementById("status");
const homeBtn = document.getElementById("homeBtn");
const hintText = document.getElementById("hintText");

const myName = sessionStorage.getItem("username") || "Stranger";

/* 🌍 REAL COUNTRY DETECTION */
let myCountry = "Unknown";
fetch("https://ipapi.co/json/")
  .then(res => res.json())
  .then(data => {
    myCountry = data.country_name || "Unknown";
  })
  .catch(() => {
    myCountry = "Unknown";
  });

/* ================= STATE ================= */
let state = "idle"; // idle | searching | chatting
let chatHistory = [];
let completedChats = 0;
let chatCounted = false;
const AD_AFTER_CHATS = 1; // you wanted 3–4, using 3


/* ================= HOME BUTTON ================= */
homeBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* ================= INITIAL CHAT STATE ================= */
if (chatBox && msgInput && sendBtn && actionBtn && statusEl) {
  setIdleState();
  hideAd();

  /* ---------- ACTION BUTTON (START / SKIP) ---------- */
 actionBtn.addEventListener("click", () => {
  if (state === "idle") {
    startSearching();
  } 
  else if (state === "searching") {
    stopSearching();
  } 
  else if (state === "chatting") {
    endChatByUser();
  }
});


  /* ---------- SOCKET EVENTS ---------- */

 socket.on("matched", (partner) => {
  state = "chatting";
  chatHistory = [];
  chatCounted = false;

  actionBtn.innerText = "⏭ Skip";
  actionBtn.disabled = false;

  msgInput.disabled = false;
  sendBtn.disabled = false;

  statusEl.innerText = "Connected";

  const flag = getCountryFlag(partner.country || "Unknown");

  chatBox.innerHTML += `
    <div class="message">
      <b>You are now chatting with ${partner.name} ${flag}</b>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
});

  socket.on("message", (data) => {
    chatBox.innerHTML += `
      <div class="message other">
        <b>${data.name}:</b> ${data.msg}
      </div>
    `;
    chatHistory.push(data);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("warning", (data) => {
    chatBox.innerHTML += `
      <div class="message" style="color:#ffcc00;">
        ⚠️ ${data.reason}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("blocked", (data) => {
    chatBox.innerHTML += `
      <div class="message" style="color:#ff4d4d;">
        🚫 ${data.reason}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on("partnerDisconnected", () => {
  // Show disconnect message in chat
  chatBox.innerHTML += `
    <div class="message" style="color:#ff4d4d;">
      🔌 Chat disconnected. The other user has left.
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  // Reset UI to idle
  statusEl.innerText = "Click Start to find a new user";

if (!chatCounted && chatHistory.length > 0) {
  completedChats++;
  chatCounted = true;
  maybeShowAd();
}


setIdleState();

});
socket.on("disconnect", () => {
  chatBox.innerHTML += `
    <div class="message" style="color:#ff4d4d;">
      🚫 You have been disconnected due to rule violation or network issue.
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  setIdleState();
});



  /* ---------- SEND MESSAGE ---------- */
  sendBtn.addEventListener("click", sendMessage);
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  /* ---------- ESC KEY = SKIP ---------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (state === "chatting") {
    endChatByUser();
  } 
  else if (state === "searching") {
    stopSearching();
  } 
  else if (state === "idle") {
    startSearching();
  }
});


}

/* ================= FUNCTIONS ================= */
function endChatByUser() {
  socket.emit("skip");

  chatBox.innerHTML += `
    <div class="message" style="color:#ffcc00;">
      ⚠️ You ended the chat.
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  if (!chatCounted) {
    completedChats++;
    chatCounted = true;
    maybeShowAd();
  }

  setIdleState(); // shows ▶️ Start
}

function startSearching() {
  hideAd();

  state = "searching";
  chatBox.innerHTML = "";

  statusEl.innerText = "Searching for a user...";
  actionBtn.innerText = "Searching...";
  actionBtn.disabled = true;

  msgInput.disabled = true;
  sendBtn.disabled = true;

  if (hintText) {
    hintText.innerText = "Press ESC to stop searching";
  }

  socket.emit("start-search", {
    name: myName,
    country: myCountry
  });
}

function stopSearching() {
  state = "idle";

  statusEl.innerText = "Search stopped";
  actionBtn.innerText = "▶️ Start";
  actionBtn.disabled = false;

  if (hintText) {
    hintText.innerText = "Press ESC to start searching";
  }
}


function setIdleState() {
  state = "idle";
  statusEl.innerText = "Click Start to find a new user";

  actionBtn.innerText = "▶️ Start";
  actionBtn.disabled = false;

  msgInput.disabled = true;
  sendBtn.disabled = true;

  if (hintText) {
    hintText.innerText = "Press ESC to start searching";
  }
}


function sendMessage() {
  const msg = msgInput.value.trim();
  if (msg === "" || state !== "chatting") return;

  chatBox.innerHTML += `
    <div class="message me">
      <b>You:</b> ${msg}
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  socket.emit("message", {
    msg,
    name: myName,
    country: myCountry
  });

  chatHistory.push({ name: myName, msg });
  msgInput.value = "";
}

function skipChat() {
  socket.emit("skip");
  chatBox.innerHTML = "";

if (!chatCounted && chatHistory.length > 0) {
  completedChats++;
  chatCounted = true;
  maybeShowAd();
}



  setIdleState();
}


function maybeShowAd() {
  const adBox = document.getElementById("adBox");
  if (!adBox) return;

  if (completedChats >= AD_AFTER_CHATS) {
    adBox.style.display = "block";
    adBox.scrollIntoView({ behavior: "smooth" });
    console.log("Ad shown after", AD_AFTER_CHATS, "chats");
    completedChats = 0;
  }
}


function hideAd() {
  const adBox = document.getElementById("adBox");
  if (adBox) adBox.style.display = "none";
}


/* ================= REPORT (READY FOR UI) ================= */
function reportUser() {
  socket.emit("report", {
    chat: chatHistory
  });
}
