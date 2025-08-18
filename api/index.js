const express = require("express");
const router = express.Router();
const testDbRouter = require("./test-db");
const huntsRouter = require("./hunts");
const playRouter = require("./play");
const leaderboardRouter = require("./leaderboard");
const checkpointsRouter = require("./checkpoints");

router.use("/test-db", testDbRouter);
router.use("/hunts", huntsRouter); // /api/play/checkpoints/:checkpointId/attempt
router.use("/play", playRouter);
router.use("/leaderboard", leaderboardRouter); // /api/leaderboard/:huntId
router.use("/checkpoints", checkpointsRouter); 

module.exports = router;
