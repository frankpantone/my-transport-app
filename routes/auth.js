// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');

// Register page
router.get('/register', (req, res) => {
  res.render('register');
});

// Register handle
router.post('/register', async (req, res) => {
  const { email, password, password2, companyName, companyAddress } = req.body;
  let errors = [];

  // Basic validation
  if (!email || !password || !password2 || !companyName || !companyAddress) {
    errors.push({ msg: 'Please enter all fields' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }
  if (password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters' });
  }

  if (errors.length > 0) {
    return res.render('register', { 
      errors, email, password, password2, companyName, companyAddress 
    });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      errors.push({ msg: 'Email already exists' });
      return res.render('register', { 
        errors, email, password, password2, companyName, companyAddress
      });
    }

    // Create new user
    const newUser = new User({ email, password, companyName, companyAddress });
    // Hash password
    const salt = await bcrypt.genSalt(10);
    newUser.password = await bcrypt.hash(newUser.password, salt);

    await newUser.save();
    req.flash('success_msg', 'You are now registered and can log in');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.render('register', { errors: [{ msg: 'Server error' }] });
  }
});

// Login page
router.get('/login', (req, res) => {
  res.render('login');
});

// Login handle
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/forms/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: true
  })(req, res, next);
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'You are logged out');
    res.redirect('/auth/login');
  });
});
router.get('/forgot-password', (req, res) => {
  res.render('forgotPassword');
});

// POST /auth/forgot-password (handles form submission)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error_msg', 'No user with that email found.');
    return res.redirect('/auth/forgot-password');
  }

  // Generate token
  const token = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  // Send email with reset link
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  const resetURL = `${req.headers.origin}/auth/reset-password/${token}`;
  await transporter.sendMail({
    to: user.email,
    from: process.env.EMAIL_USER,
    subject: 'Password Reset',
    text: `You requested a password reset. Click here: ${resetURL}`
  });

  req.flash('success_msg', 'Password reset link sent to your email.');
  res.redirect('/auth/login');
});

// GET /auth/reset-password/:token
router.get('/reset-password/:token', async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    req.flash('error_msg', 'Reset link invalid or expired.');
    return res.redirect('/auth/forgot-password');
  }
  res.render('resetPassword', { token: req.params.token });
});

// POST /auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    req.flash('error_msg', 'Token invalid or expired.');
    return res.redirect('/auth/forgot-password');
  }

  // Update password
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(req.body.password, salt);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  req.flash('success_msg', 'Password has been reset. You can now log in.');
  res.redirect('/auth/login');
});

module.exports = router;