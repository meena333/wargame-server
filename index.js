const express = require('express')
const cors = require('cors')
const bodyparser = require('body-parser')
const Sequelize = require('sequelize')

const app = express()
const corsMiddleware = cors()
const middleware = bodyparser.json()
const port = process.env.PORT || 4000;

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:secret@localhost:5432/postgres';
const db = new Sequelize(databaseUrl)

db.sync({ force: false })
  .then(() => console.log('Db synced'))
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

app.use(corsMiddleware)
app.use(middleware)

app.listen(port, () => console.log('Listening on port', port))

module.exports = db