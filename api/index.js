const express = require('express');
const apiRouter = express.Router();
const huntRouter = require('../routes/huntRoutes');
const checkpointRouter = require('../routes/checkpointRoutes');


apiRouter.use('/hunts', huntRouter);
apiRouter.use('/checkpoints', checkpointRouter);

module.exports = apiRouter;