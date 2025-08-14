const express = require("express");
const router = express.Router();
const testDbRouter = require("./test-db");
const huntsRouter = require("./hunts");
const playRouter = require("./play");

router.use("/test-db", testDbRouter);
router.use("/hunts", huntsRouter); // /api/play/checkpoints/:checkpointId/attempt
router.use("/play", playRouter);


module.exports = router;
