const express = require('express');
const router = express.Router();
const Checkpoint = require('../models/Checkpoint');

router.patch('/:id', async (req, res) => {
  try {
    const { riddle, hint, latitude, longitude, order, badgeImage, badgeTitle } = req.body;
    const [updated] = await Checkpoint.update(
      { riddle, hint, latitude, longitude, order, badgeImage, badgeTitle },
      { where: { id: req.params.id } }
    );
    if (updated) {
      const updatedCheckpoint = await Checkpoint.findByPk(req.params.id);
      res.json(updatedCheckpoint);
    } else {
      res.status(404).json({ message: 'Checkpoint not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating checkpoint' });
  }
});

module.exports = router;