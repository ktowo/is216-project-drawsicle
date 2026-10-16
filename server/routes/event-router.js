const express = require("express");
const router = express.Router();

const eventCtrl = require('../controllers/event-controller.js');

router.get("/get-chain/", eventCtrl.getChain);

// Export
module.exports = router;