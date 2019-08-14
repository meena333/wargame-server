const express = require('express')
const cors = require('cors')
const bodyparser = require('body-parser')
const Sequelize = require('sequelize')
const Sse = require('json-sse')
const data = require('./data')
const auth = require('./auth/middleware')
const bcrypt = require('bcrypt')
const { toJWT } = require('./auth/jwt');


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

app.get('/game/:gameName', async (req, res) => {
  const game = await Game.findAll({ where: { name: req.params.gameName } })
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
  const encryptedPw = bcrypt.hashSync(req.body.password, 10)
  const { name } = req.body
  const { email } = req.body
  const player = await Player.create({ name, email, password: encryptedPw })
  res.send({
    jwt: toJWT({ userId: 1 })
  })
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

  for (let i = startValue; i < shuffledCardDeck.length; i++) {
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


app.get('/player/login', async (req, res) => {

  Player
    .findOne({
      where: {
        email: req.body.email
      }
    })
    .then(entity => {
      const player = entity.dataValues
      if (!entity) {
        res.status(400).send({
          message: 'Player with that email does not exist'
        })
      }

      // 2. use bcrypt.compareSync to check the password against the stored hash
      if (bcrypt.compareSync(req.body.password, entity.password)) {

        // 3. if the password is correct, return a JWT with the userId of the user (user.id)
        console.log('Password is correct')
        res.send(player)
      }
      else {
        res.status(400).send({
          message: 'Password was incorrect'
        })
      }
    })
    .catch(err => {
      console.error(err)
      res.status(500).send({
        message: 'Something went wrong'
      })
    })






})

app.put('/player/play/:cardId', async (req, res) => {
  //player.update({ playedId: request.params.cardId }), if (otherPersonPlayed), player.update({ points: player.points + 1, playedId: null }), player.removeCard(cardId?), if (allCardsGone) game.update({ status: ‘done’ })
})

app.listen(port, () => console.log('Listening on port', port))

module.exports = db