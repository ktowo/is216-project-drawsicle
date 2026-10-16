const express = require("express");
const router = express.Router();

const eventRouter = require("./event-router.js");

// Base Routes
router.get("/", (req, res) => {
    res.send("Hello world!")
});

router.use("/event/", eventRouter);

// 404 Not Found
router.all(/.*/, (req, res) => {
    res.status(404).send("404 not found");
})

// Export
module.exports = router;