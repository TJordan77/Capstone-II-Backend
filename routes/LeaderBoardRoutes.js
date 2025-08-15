// Leaderboard route
router.get("/hunts/:huntID/leaderboard",(req, res) => {
  const {huntID} = req.params;

const mockLeaderBoardData = [
  {
    id: 1,
    completionTime: 120,
    completionDate: "2025-08-10T12:00:00.000Z",
    User: {
      username: 'PlayerOne'
    }
  },
  {
    id: 2,
    completionTime: 150,
    completionDate: "2025-08-09T13:30:00.000Z",
    User: {
      username: 'PlayerTwo'
    }
  },
  {
    id: 3,
    completionTime: 180,
    completionDate: "2025-08-11T14:15:00.000Z",
    User: {
      username: 'PlayerThree'
    }
  },
];

res.json(mockLeaderBoardData);


});