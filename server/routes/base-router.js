const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const characterRouter = require('./character-router.js');
const eventRouter = require('./event-router.js');
const applicationRouter = require('./application-router.js');
const matchRouter = require('./match-router.js');
const submissionRouter = require('./submission-router.js');
const outreachRouter = require('./outreach-router.js');
const dashboardRouter = require('./dashboard-router.js');
const userRouter = require('./user-router.js');
const discoverRouter = require('./discover-router.js');
const showcaseRouter = require('./showcase-router.js');
const adminRouter = require('./admin-router.js');
const reportRouter = require('./report-router.js');
const museumRouter = require('./museum-router.js');
const favouriteRouter = require('./favourite-router.js');
const friendsRouter = require('./friends-router.js');
const fileRouter = require('./file-router.js');
const cronRouter = require('./cron-router.js');

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

router.use("/characters", characterRouter);
router.use("/events", eventRouter);
// Everything under one event. These routers use mergeParams to read :eventId.
router.use(
  "/events/:eventId",
  applicationRouter,
  matchRouter,
  submissionRouter,
  outreachRouter,
);
router.use("/dashboard", dashboardRouter);
router.use("/users", userRouter);
router.use("/discover", discoverRouter);
router.use("/showcase", showcaseRouter);
router.use("/admin", adminRouter);
router.use("/reports", reportRouter);
router.use("/museum", museumRouter);
router.use("/favourites", favouriteRouter);
router.use("/friends", friendsRouter);
router.use("/files", fileRouter);
router.use("/cron", cronRouter);

// Export
module.exports = router;
