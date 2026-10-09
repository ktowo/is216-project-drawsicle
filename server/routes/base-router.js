const express = require("express");
const router = express.Router();

// Base Routes
router.get("/", (req, res) => res.send("Hello world!"));

// 404 Not Found
router.all(/.*/, (req, res) => {
    res.status(404).send("404 not found");
})

// Export
module.exports = router;