const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const Form = require('../models/Form');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

// Admin Dashboard - 3 boxes with pagination
router.get('/', ensureAdmin, async (req, res) => {
  try {
    // We'll use the same ?page= param for each box, but you can separate them if you prefer
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // 1) MY ORDERS:
    //   - assigned to me
    //   - not canceled or paid (and you might filter statuses like 'Submitted', 'Quoted', 'Accepted')
    //   - Example: status in [Submitted, Quoted, Accepted], isPaid: false
    const myOrdersQuery = {
      owner: req.user._id,
      status: { $in: ['Submitted', 'Quoted', 'Accepted'] },
      isPaid: false
    };
    const [myOrders, myOrdersCount] = await Promise.all([
      Form.find(myOrdersQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('owner'),
      Form.countDocuments(myOrdersQuery)
    ]);
    const myOrdersPages = Math.ceil(myOrdersCount / limit);

    // 2) SUBMITTED ORDERS:
    //   - unassigned (owner = null)
    //   - status = 'Submitted'
    const submittedQuery = {
      owner: null,
      status: 'Submitted'
    };
    const [submittedOrders, submittedCount] = await Promise.all([
      Form.find(submittedQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Form.countDocuments(submittedQuery)
    ]);
    const submittedPages = Math.ceil(submittedCount / limit);

    // 3) CLAIMED ORDERS:
    //   - assigned (owner != null)
    //   - includes canceled, paid, or any other statuses not in My Orders or Submitted
    //   - So basically: owner != null AND (status != 'Submitted' OR isPaid = true, etc.)
    //   - We'll do a simple approach: just filter out status='Submitted'
    const claimedQuery = {
      owner: { $ne: null },
      status: { $ne: 'Submitted' }
    };
    const [claimedOrders, claimedCount] = await Promise.all([
      Form.find(claimedQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('owner'),
      Form.countDocuments(claimedQuery)
    ]);
    const claimedPages = Math.ceil(claimedCount / limit);

    return res.render('adminHome', {
      myOrders,
      myOrdersPages,
      submittedOrders,
      submittedPages,
      claimedOrders,
      claimedPages,
      currentPage: page
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// GET /admin/orders/:requestNumber
// Detailed view of one order, e.g. TRQ_123
router.get('/orders/:requestNumber', ensureAdmin, async (req, res) => {
  try {
    const order = await Form.findOne({ requestNumber: req.params.requestNumber })
      .populate('user')
      .populate('owner');

    if (!order) throw new Error('Order not found');

    // Optionally fetch all admin users if you want a dropdown for reassigning
    // const allAdmins = await User.find({ role: 'admin' });

    res.render('adminOrderDetail', {
      order
      // allAdmins
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not load order details');
    res.redirect('/admin');
  }
});

// POST /admin/set-price/:formId
// Sets the price => status = 'Quoted'
// In routes/admin.js
router.post('/set-price/:formId', ensureAdmin, async (req, res) => {
  try {
    const { formId } = req.params;
    const { price } = req.body;

    // Parse the price to ensure it's numeric
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      throw new Error('Price must be a valid positive number.');
    }

    // Find and update the form
    const form = await Form.findById(formId);
    if (!form) throw new Error('Form not found.');

    form.price = numericPrice; // Store the price
    form.status = 'Quoted'; // Update status to Quoted
    await form.save();

    req.flash('success_msg', `Price set to $${numericPrice} for Request #${form.requestNumber}.`);
    res.redirect(`/admin/orders/${form.requestNumber}`);
  } catch (err) {
    console.error('Error setting price:', err);
    req.flash('error_msg', err.message);
    res.redirect('/admin');
  }
});

// POST /admin/claim/:formId
// Admin claims ownership
router.post('/claim/:formId', ensureAdmin, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');

    // If it's already claimed by someone else, you can decide to override or block
    form.owner = req.user._id;
    await form.save();

    req.flash('success_msg', 'You claimed this order.');
    res.redirect(`/admin/orders/${form.requestNumber}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error claiming order.');
    res.redirect('/admin');
  }
});

// POST /admin/reassign/:formId
// Reassign ownership to another admin
router.post('/reassign/:formId', ensureAdmin, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');

    const { newOwnerId } = req.body;
    form.owner = newOwnerId;
    await form.save();

    req.flash('success_msg', 'Order ownership reassigned.');
    res.redirect(`/admin/orders/${form.requestNumber}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error reassigning order.');
    res.redirect('/admin');
  }
});

// POST /admin/requote/:formId
// Re-quote if not paid
router.post('/requote/:formId', ensureAdmin, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');

    if (form.isPaid) {
      req.flash('error_msg', 'Cannot re-quote a paid order.');
      return res.redirect(`/admin/orders/${form.requestNumber}`);
    }

    form.status = 'Re-quote';
    await form.save();

    req.flash('success_msg', 'Order set to Re-quote. You can adjust details or price.');
    res.redirect(`/admin/orders/${form.requestNumber}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error re-quoting order.');
    res.redirect('/admin');
  }
});

module.exports = router;