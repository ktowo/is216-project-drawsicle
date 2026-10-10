// Import

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require('dotenv');
const session = require('express-session');
const { setupAuth } = require('./setup-auth.js');

// Initialize Server
const server = express();
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

setupAuth(server);    

// Load Env variable
dotenv.config({ path: './.env' });

// Middleware
server.use(express.static(path.join(__dirname, "public")));
server.use(express.urlencoded({ extended: true }));

// Session
const secret = process.env.SECRET;
server.use(session({
  secret: secret, // sign the session ID cookie. should be a long, random, and secure string, preferably stored in an environment variable
  resave: false, // Prevents the session from being saved back to the session store if nothing has changed.
  saveUninitialized: false, // Prevents a new, empty session from being saved to the store.
  cookie: {
    secure: false // even if I reload, session will stay
  }
}));

// Routes
const baseRouter = require("./routes/base-router.js")
server.use("/", baseRouter);

// Database connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

// Initialize Server
function startServer() {
  const hostname = process.env.HOST || "localhost";
  const port = process.env.PORT || 8000;

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}


// call connectDB first and when connection is ready we start the web server
connectDB().then(startServer);
