const { Router } = require('express')
const bcrypt = require('bcrypt')
const { toJWT, toData } = require('./jwt')
const Player = require('../index')

const router = new Router()

router.post('/login', (req, res) => {

  if (req.body.email === "" || req.body.password === "") {
    res.status(400).send({
      message: 'Please supply a valid email and password'
    })
  } else {
    Player.findOne({
      where: {
        email: req.body.email
      }
    })
      .then(entity => {
        if (!entity) {
          res.status(400).send({
            message: 'User with that email does not exist'
          });
        } else {
          //console.log('test for password truthiness', boolVal);
          if (bcrypt.compareSync(req.body.password, entity.password)) {
            res.send({
              jwt: toJWT({ userId: entity.id })
            });
          } else {
            res.status(400).send({
              message: 'Password was incorrect'
            });
          }
        }
      })
      .catch(err => {
        console.error(err);
        res.status(500).send({
          message: 'Something went wrong'
        });
      });
  }


})


module.exports = router