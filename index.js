const express = require('express')
const cors = require('cors')
const bodyparser = require('body-parser')
const Sequelize = require('sequelize')
const Sse = require('json-sse')
const data = require('./data')
const auth = require('./auth/middleware')

const app = express()
const corsMiddleware = cors()
const bodyParserMiddleware = bodyparser.json()
const port = process.env.PORT || 4000;

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/postgres';
const db = new Sequelize(databaseUrl)

db.sync({ force: false })
  .then(() => console.log('Database synced'))
  .catch(console.error)

const Game = db.define('game', {
  name: Sequelize.STRING,
  status: Sequelize.ENUM('joining', 'full')
})

const Player = db.define('player', {
  name: Sequelize.STRING,
  email: Sequelize.STRING,
  password: Sequelize.STRING,
  points: Sequelize.INTEGER
})

const Card = db.define('card', {
  suit: Sequelize.ENUM('CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'),
  value: Sequelize.STRING,
  image: Sequelize.STRING
})

Game.hasMany(Player)
Player.belongsTo(Game)
Player.hasMany(Card)
Card.belongsToMany(Player, { through: 'PlayerCards' })

const stream = new Sse()

app.use(corsMiddleware)
app.use(bodyParserMiddleware)

//Card.bulkCreate(data);
app.post('/card', (req, res) => {
  Card.bulkCreate(data);
})


//data.map(card => )


app.get('/stream', async (req, res) => {
  console.log('console inside stream get')
  const games = await Game
    .findAll({ include: [Player] })

  const data = JSON.stringify(games)
  stream.updateInit(data)

  stream.init(req, res)


  //res.send('All fine')
})

app.get('/game/:gameName', async (req,res) => {
   const game = await Game.findAll({where : { name: req.params.gameName}})
   res.send(game)
})

app.post('/game', async (req, res) => {
  const game = await Game.create(req.body)

  const games = await Game.findAll({
    include: [Player]
  })

  const data = JSON.stringify(games)

  stream.updateInit(data)
  stream.send(data)

  res.send(game)
}
)

app.post('/player', async (req, res) => {
  const player = await Player.create(req.body)
})

app.get('/game/join/:gameId', async (req, res) => {
  function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
  }

  const game = await Game.findByPk(req.params.gameId)
  const player = await Player.findByPk(1)

  const cardsTotal = await Card.findAll()
  const shuffledCardDeck = shuffle(cardsTotal)
  let noOfCards = 0
  const totalCardsperPlayer = 10
  let startValue = 0;

  if (game.status == 'joining') {
    startValue = 0
  }
  else {
    startValue = 10
  }
 
  for(let i  = startValue; i < shuffledCardDeck.length; i++){ 
    if (noOfCards < totalCardsperPlayer) {
      await player.addCard(shuffledCardDeck[i])
    }
      noOfCards++
    }
  
  // cardsTotal.map(card => console.log(card.dataValues))
  
  // const arr = [1, 2, 3, 4, 5, 6]
  // const player1Deck = arr.splice(0, 3)
  // const player2Deck = arr
  // console.log('player1Deck test', player1Deck)
  // console.log('player2Deck test', player2Deck)

  // const player = await Player.findByPk(1)
  // console.log('player test', player)
  // console.log('shuffled card deck:', shuffledCardDeck)
  // await player.addCards(shuffledCardDeck[0])
})

app.put('/player/:playerId', (req, res) => {
  // Player.addCard
})

app.put('/player/play/:cardId', async (req, res) => {
  //player.update({ playedId: request.params.cardId }), if (otherPersonPlayed), player.update({ points: player.points + 1, playedId: null }), player.removeCard(cardId?), if (allCardsGone) game.update({ status: ‘done’ })
})

app.listen(port, () => console.log('Listening on port', port))

module.exports = db