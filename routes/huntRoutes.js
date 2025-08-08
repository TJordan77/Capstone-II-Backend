const express = require('express');
const router = express.Router();
const Hunt = require('../models/Hunt');
const Checkpoint = require('../models/Checkpoint');
const { Op } = require('sequelize');

router.get('/creator/:creatorId', async (req, res) => {
  try {
    const hunts = await Hunt.findAll({
      where: { creatorId: req.params.creatorId },
      include: Checkpoint,
    });
    res.json(hunts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching hunts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, creatorId } = req.body;
    const hunt = await Hunt.create({ title, description, creatorId, slug: title.toLowerCase().replace(/\s/g, '-') }); // Basic slug creation
    res.status(201).json(hunt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating hunt' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, description } = req.body;
    const [updated] = await Hunt.update({ title, description }, {
      where: { id: req.params.id }
    });
    if (updated) {
      const updatedHunt = await Hunt.findByPk(req.params.id);
      res.json(updatedHunt);
    } else {
      res.status(404).json({ message: 'Hunt not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating hunt' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Hunt.destroy({
      where: { id: req.params.id }
    });
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Hunt not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting hunt' });
  }
});

router.patch('/:id/publish', async (req, res) => {
  try {
    const hunt = await Hunt.findByPk(req.params.id);
    if (!hunt) {
      return res.status(404).json({ message: 'Hunt not found' });
    }
    hunt.isPublished = !hunt.isPublished;
    await hunt.save();
    res.json(hunt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error toggling publish status' });
  }
});

router.post('/:id/checkpoints', async (req, res) => {
  try {
    const { riddle, hint, latitude, longitude, order, badgeImage, badgeTitle } = req.body;
    const checkpoint = await Checkpoint.create({
      huntId: req.params.id,
      riddle,
      hint,
      latitude,
      longitude,
      order,
      badgeImage,
      badgeTitle,
    });
    res.status(201).json(checkpoint);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error adding checkpoint' });
  }
});


router.get('/:huntId/leaderboard', async (req, res) => {
  try {
    const scores = await Score.findAll({
      where: { huntId: req.params.huntId },
      include: [{ model: User, attributes: ['username'] }],
      order: [['completionTime', 'ASC']],
      limit: 10, // Get top 10 scores
    });
    res.json(scores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

module.exports = router;