const express = require('express')
const cors = require('cors')
const bodyparser = require('body-parser')
const Sequelize = require('sequelize')
const Sse = require('json-sse')

const app = express()
const corsMiddleware = cors()
const bodyParserMiddleware = bodyparser.json()
const port = process.env.PORT || 4000;

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:secret@localhost:5432/postgres';
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
  password: Sequelize.STRING,
  points: Sequelize.INTEGER
})

const Card = db.define('card', {
  suit: Sequelize.ENUM('Clubs', 'Diamonds', 'Hearts', 'Spades'),
  rank: Sequelize.INTEGER,
  imageUrl: Sequelize.STRING
})

Game.hasMany(Player)
Player.belongsTo(Game)
Player.hasMany(Card)
Card.belongsToMany(Player, { through: 'PlayerCards' })

const stream = new Sse()

app.use(corsMiddleware)
app.use(bodyParserMiddleware)

app.get('/stream', (req, res) => {
  console.log('All fine')
  res.send('All fine')
})

app.post('/game', async (req, res) => {
  const game = await Game.create(req.body)

  // const channels = await Channel.findAll({
  //   include: [Message]
  // })

  // const data = JSON.stringify(channels)

  // stream.updateInit(data)
  // stream.send(data)

  // response.send(channel)
}
)

app.post('/player', async (req, res) => {
  const player = await Player.create(req.body)
})

app.put('/game/join/:gameId', async (req, res) => {
  //Update player.gameId, Update game.status, 
  //Card.findAll(), cards.map(card => player.addCard(card)), 
  //player.update({ points: 0 })
})

app.put('/player/play/:cardId', async (req, res) => {
  //player.update({ playedId: request.params.cardId }), if (otherPersonPlayed), player.update({ points: player.points + 1, playedId: null }), player.removeCard(cardId?), if (allCardsGone) game.update({ status: ‘done’ })
})

app.listen(port, () => console.log('Listening on port', port))

module.exports = db