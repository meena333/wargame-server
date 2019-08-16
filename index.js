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
  status: Sequelize.ENUM('joining', 'full', 'started')
})

const Player = db.define('player', {
  name: Sequelize.STRING,
  email: Sequelize.STRING,
  password: Sequelize.STRING,
  points: Sequelize.INTEGER,
  cardPlayed: Sequelize.INTEGER
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
      include: [
        { association: 'cards' }
      ]
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
  const { name, email, password } = req.body

  const existing = await Player.findOne({ where: { email } })

  console.log('existing test:', existing)

  if (existing) {
    res.status(400).send(`The email ${email} is already in use`)
  } else {
    const encryptedPw = bcrypt.hashSync(password, 10)

    const player = await Player.create({ name, email, password: encryptedPw })

    res.status(200).send({
      jwt: toJWT({ userId: player.id }),
      message: 'unverified',
      name: player.name,
      id: player.id,
      points: player.points
    })
  }
})

app.put('/game/start/:gameId', async (request, response) => {
  const { gameId } = request.params
  const game = await Game.findByPk(gameId)

  if (game.status === 'full') {
    const updated = await game.update({ status: 'started' })

    await update()

    response.send(updated)
  } else {
    response.send('Waiting for more players')
  }
})

app.put('/game/join/:gameId', async (req, res) => {
  function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
  }

  const game = await Game.findByPk(req.params.gameId)
  console.log('game', game)

  console.log('req.body from join', req.body)
  const player = await Player.findByPk(req.body.id)
  const updated = await player.update({ gameId: req.params.gameId, points: 0 })

  const count = await Player.count({
    where: {
      gameId: req.params.gameId
    }
  })
  console.log('count!!!!!!', count)
  if (count === 2) {
    game.update({ status: 'full' })
  }

  const cardsTotal = await Card.findAll()
  const shuffledCardDeck = shuffle(cardsTotal)

  for (let i = 0; i < 10; i++) {
    await player.addCard(shuffledCardDeck[i])
  }

  await update()

  res.send(updated)
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

app.get('/player/login', async (req, res) => {
  let player;
  Player
    .findOne({
      where: {
        email: req.query.email
      }
    })
    .then(entity => {
      if (!entity) {
        res.status(400).send({
          //message: 'Player with that email does not exist'
          message: 'unverified'
        })
      }
      else {
        player = entity.dataValues
      }
      // 2. use bcrypt.compareSync to check the password against the stored hash
      if (bcrypt.compareSync(req.query.password, entity.password)) {
        // 3. if the password is correct, return a JWT with the userId of the user (user.id)
        console.log('Password is correct')
        //res.send(player)
        res.status(200).send({
          jwt: toJWT({ userId: player.id }), message: 'verified', name: player.name, id: player.id, points: player.points
        })
      }
      else {
        console.log('Password is incorrect')
        res.send({ message: 'unverified' })
      }
    })
    .catch(err => {
      console.error(err)
      res.status(500).send({
        message: 'unverified'
      })
    })
})

app.put('/player/play/:gameId/:playerId/:cardId', async (req, res) => {
  //player.update({ playedId: request.params.cardId }), if (otherPersonPlayed), player.update({ points: player.points + 1, playedId: null }), player.removeCard(cardId?), if (allCardsGone) game.update({ status: ‘done’ })
  //compare cards from both players to determine winner
  //so get cards from both players belonging to the gameID
  const player = await Player.findByPk(req.params.playerId)
  await player.update({ cardPlayed: req.params.cardId })
  //const card = await Card.findOne(req.params.cardId)
  const game = await Game.findByPk(req.params.gameId)
  const players = await Player.findAll({
    where: {
      gameId: req.params.gameId
    }
  })

  if (players.length === 2) {
    //res.send(players[0].cardPlayed)


    playerCards = players.map(player => player.cardPlayed)
    res.send(playerCards)
  }
  else {
    res.send('not really')
  }
  //check if other player has cardPlayed != null
  //if players[0].cardPlayed and players[1].cardPlayed
  // player0card = Card.findOne(players[0].cardPlayed)
  //player1card = Card.findOne(players[1].cardPlayed)
  //if (player0card == 'ACE') { player0cardvalue = 14}
  //if (player0card == 'KING') { player0cardvalue = 13}
  //if (player0card == 'QUEEN') { player0cardvalue = 12}
  //(player0card == 'JACK') { player0cardvalue = 11}
  //else player0cardvalue = parseInt(player0card)

  //if (player1card == 'ACE') { player1cardvalue = 14}
  //if (player1card == 'KING') { player1cardvalue = 13}
  //if (player1card == 'QUEEN') { player1cardvalue = 12}
  //(player1card == 'JACK') { player1cardvalue = 11}
  //else player1cardvalue = parseInt(player1card)

  //if player0cardvalue < player1cardvalue 
  // players[1].points++
  //else
  //players[0].points++

  // await update()
  // res.send(players)
})

app.listen(port, () => console.log('Listening on port', port))

module.exports = db