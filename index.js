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
Player.belongsToMany(Card, { through: 'PlayerCards' })
Card.belongsToMany(Player, { through: 'PlayerCards', as: "cards" })

const stream = new Sse()

app.use(corsMiddleware)
app.use(bodyParserMiddleware)

prefillCardData();

//add card data (52 cards) if it isn't already there
async function prefillCardData() {
  const result = await Card.findOne({ where: { suit: 'CLUBS' } })
  if (!result) {
    Card.bulkCreate(data);
  }
}

async function update() {
  const games = await Game.findAll({
    include: [{
      model: Player,
      include: [{
        model: Card,
        include: [
          { association: 'cards' }
        ]
      }]
    }]
  })
  const data = JSON.stringify(games)
  stream.send(data)
}

app.get('/card/:playerId', async (req, res) => {

  const player = await Player.findByPk(req.params.playerId)
  const cards = await player.getCards()
  res.send(cards)
  update()
})

//reset all the playerIds in the Cards table to null
app.put('/card', async (req, res) => {
  const Op = Sequelize.Op;
  const result = await Card.update({ playerId: null }, {
    where: { id: { [Op.gte]: 0 } }
  })
  res.send(result)
})



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
  const game = await Game.findOne({ where: { name: req.params.gameName } })
  res.send(game)
})

// app.get('/game/:gameId', async (req, res) => {
//   console.log(req.params.gameId)
//   const game = await Game.findByPk(req.params.gameId)
//   res.send(game)
// })

app.post('/game', async (req, res) => {
  const game = await Game.create(req.body)
  res.send(game)
  await update()
})

app.post('/player', async (req, res) => {
  const encryptedPw = bcrypt.hashSync(req.body.password, 10)
  const { name, email } = req.body
  const player = await Player.create({ name, email, password: encryptedPw })
  // res.send({
  //   jwt: toJWT({ userId: player.id })
  // })
  res.send(player)
})

app.put('/game/join/:gameId', async (req, res) => {

  function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
  }
  const game = await Game.findByPk(req.params.gameId)
  console.log('game', game)
  
  console.log('req.body from join', req.body)
  const player = await Player.findByPk(req.body.id)
  await player.update({ gameId: req.params.gameId, points: 0 })

  const countObject = await Player.findAndCountAll({
    where: {
      gameId: req.params.gameId
    }
  })

  const count = countObject.count
  console.log('count!!!!!!', count)
  if (count === 2) {
    game.update({status: 'full'})
  }

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

  await update()
})

app.put('/player/resetcards/:playerId', async (req, res) => {
  const cardArray = []
  for (let i = 1; i < 53; i++) {
    cardArray.push(i)
  }
  const player = await Player.findByPk(req.params.playerId)
  const game = await Game.findOne({ where: { id: player.gameId } })
  await game.update({
    status: 'joining'
  })
  const result = await player.removeCards(cardArray)
  //await player.removeGame(req.params.gameId)
  await player.update({ gameId: null })
  res.send('cards removed for player')
  await update()
 })

app.put('/player/:playerId', (req, res) => {
  // Player.addCard
})

app.get('/player/login', async (req, res) => {
  Player
    .findOne({
      where: {
        email: req.query.email
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
      if (bcrypt.compareSync(req.query.password, entity.password)) {
        // 3. if the password is correct, return a JWT with the userId of the user (user.id)
        console.log('Password is correct')
        res.send(player)
        // res.send({
        //   jwt: toJWT({ userId: player.id })
        // })
      }
      else {
        console.log('Password is incorrect')
        res.send({})
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