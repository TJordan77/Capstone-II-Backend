const express = require("express");
const router = express.Router();
const testDbRouter = require("./test-db");

router.use("/test-db", testDbRouter);
router.use("/", require("./play")); // /api/play/checkpoints/:checkpointId/attempt
router.use("/hunts", require("./hunts")); 


module.exports = router;
