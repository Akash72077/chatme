require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ================= MONGODB CONNECTION ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB connection error:", err));



/* ================= REPORT SCHEMA ================= */
const reportSchema = new mongoose.Schema({
  type: {
    type: String, // sexual | bad_word | user_report
    required: true
  },

  matchedWord: String,      // exact word that triggered
  message: String,          // full message user sent

  reportedBy: String,       // socket.id of sender
  reportedUser: String,     // socket.id of partner

  username: String,         // optional (future)
  country: String,          // optional

  actionTaken: String,      // disconnected | warned

  time: {
    type: Date,
    default: Date.now
  }
});


const Report = mongoose.model("Report", reportSchema);



/* ================= ADMIN API ================= */
app.get("/admin/data", async (req, res) => {
  const pass = req.query.pass;

  if (pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const reports = await Report.find()
      .sort({ time: -1 })
      .limit(100);

    res.json(reports);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

/* ================= MODERATION ================= */
const sexualWords = [
  "sex", "porn", "nude", "xxx", "fuck", "boobs", "pussy", "dick"
];

const badWords = [
  "idiot", "stupid", "fool", "bitch", "asshole"
];

function containsWord(message, list) {
  const msg = message.toLowerCase();
  return list.some(word => msg.includes(word));
}

/* ================= STATE ================= */
let waitingUser = null;
let onlineUsers = 0;

function findMatchedWord(message, list) {
  const msg = message.toLowerCase();
  return list.find(word => msg.includes(word));
}

/* ================= SOCKET LOGIC ================= */
io.on("connection", (socket) => {
  onlineUsers++;
  io.emit("onlineUsers", onlineUsers);
  console.log("User connected:", socket.id);

  /* 🔍 START SEARCH */
  socket.on("start-search", (userData) => {
    if (waitingUser === socket) return;
  socket.username = userData.name;
  socket.country = userData.country;

  if (waitingUser && waitingUser !== socket) {
    socket.partner = waitingUser;
    waitingUser.partner = socket;

    // send partner info to both users
    socket.emit("matched", {
      name: waitingUser.username,
      country: waitingUser.country
    });

    waitingUser.emit("matched", {
      name: socket.username,
      country: socket.country
    });

    waitingUser = null;
  } else {
    waitingUser = socket;
  }
});
/* 🛑 STOP SEARCH */
socket.on("stop-search", () => {
  if (waitingUser === socket) {
    waitingUser = null;
  }
});


  /* 💬 MESSAGE */
  socket.on("message", async (data) => {
    const msg = data.msg;

    // 🔴 Sexual content → auto block & store
   const sexualWord = findMatchedWord(msg, sexualWords);
if (sexualWord) {
  try {
    await Report.create({
      type: "sexual",
      matchedWord: sexualWord,
      message: msg,
      reportedBy: socket.id,
      reportedUser: socket.partner?.id || null,
      username: socket.username || "Stranger",
      country: socket.country || "Unknown",
      actionTaken: "disconnected"
    });

    socket.emit("blocked", {
      reason: "Sexual content is not allowed."
    });

    if (socket.partner) {
      socket.partner.emit("partnerDisconnected");
      socket.partner.partner = null;
    }

    // ⏳ let MongoDB finish write
    setTimeout(() => {
      socket.disconnect(true);
    }, 300);

  } catch (err) {
    console.error("Failed to save sexual report:", err);
  }

  return;
}

    // 🟡 Bad words → warning (optional store later)
   const badWord = findMatchedWord(msg, badWords);
if (badWord) {
  try {
    await Report.create({
      type: "bad_word",
      matchedWord: badWord,
      message: msg,
      reportedBy: socket.id,
      reportedUser: socket.partner?.id || null,
      username: socket.username || "Stranger",
      country: socket.country || "Unknown",
      actionTaken: "warned"
    });

  } catch (err) {
    console.error("Failed to save bad word report:", err);
  }

  socket.emit("warning", {
    reason: "Inappropriate language is not allowed."
  });

  return;
}


    // ✅ Safe message
    if (socket.partner) {
      socket.partner.emit("message", data);
    }
  });

  /* 🚩 REPORT USER */
  socket.on("report", async (data) => {
    await Report.create({
      type: "user_report",
      reportedBy: socket.id,
      reportedUser: socket.partner?.id || null,
      chat: data.chat
    });

    if (socket.partner) {
      socket.partner.emit("partnerDisconnected");
      socket.partner.partner = null;
    }

    socket.emit("reported");
  });

 /* ⏭️ SKIP */
socket.on("skip", () => {
  // If user was waiting, remove them
  if (waitingUser === socket) {
    waitingUser = null;
  }

  if (socket.partner) {
    socket.partner.emit("partnerDisconnected");
    socket.partner.partner = null;
    socket.partner = null;
  }
});


  /* ❌ DISCONNECT */
  socket.on("disconnect", () => {
    onlineUsers--;
    io.emit("onlineUsers", onlineUsers);

    if (socket.partner) {
      socket.partner.emit("partnerDisconnected");
      socket.partner.partner = null;
    }

    if (waitingUser === socket) {
      waitingUser = null;
    }

    console.log("User disconnected:", socket.id);
  });
});

/* ================= SERVER ================= */
server.listen(3000, () => {
  console.log("ChatMe running on http://localhost:3000");
});
