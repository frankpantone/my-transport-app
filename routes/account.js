// routes/account.js
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

router.get('/', ensureAuthenticated, (req, res) => {
  res.render('myAccount', { user: req.user });
});

router.post('/', ensureAuthenticated, async (req, res) => {
  // e.g. update user companyName, address
});

module.exports = router;