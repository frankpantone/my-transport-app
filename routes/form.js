const express = require('express');
const router = express.Router();
const Form = require('../models/Form');
const excelJS = require('exceljs');
const nodemailer = require('nodemailer');
const { ensureAuthenticated } = require('../middleware/auth');
const vinLookupService = require('../services/vinLookupService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

// Example env variable for email recipient
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'recipient@example.com';

/**
 * GET /forms/dashboard
 * User dashboard with two boxes:
 *  - My Submissions (statuses: Submitted, Quoted, Accepted)
 *  - Archived Orders (all other statuses)
 */
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const forms = await Form.find({ user: req.user._id });

    res.render('dashboard', {
      forms,
      user: req.user
    });
  } catch (err) {
    console.error('Error fetching forms:', err);
    req.flash('error_msg', 'Error loading dashboard.');
    res.redirect('/');
  }
});router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const forms = await Form.find({ user: req.user._id });

    res.render('dashboard', {
      forms,
      user: req.user
    });
  } catch (err) {
    console.error('Error fetching forms:', err);
    req.flash('error_msg', 'Error loading dashboard.');
    res.redirect('/');
  }
});

/**
 * GET /forms/new
 * Render the form submission page.
 * - Pre-fill user's companyName/companyAddress
 * - Multiple VINs
 * - Pickup/Delivery contact info
 */
router.get('/new', ensureAuthenticated, (req, res) => {
  res.render('form', {
    companyName: req.user.companyName,
    companyAddress: req.user.companyAddress
  });
});

/**
 * POST /forms/new
 * Create a new transport request form with multiple VINs, contact info, etc.
 * Send an Excel file to RECIPIENT_EMAIL. 
 */
router.post('/new', ensureAuthenticated, async (req, res) => {
  try {
    // Debug: see the request body
    console.log('DEBUG req.body =>', req.body);

    // 1) Generate TRQ_x
    const lastForm = await Form.findOne().sort({ createdAt: -1 });
    let nextNumber = 1;
    if (lastForm && lastForm.requestNumber) {
      const lastNum = parseInt(lastForm.requestNumber.replace('TRQ_', ''), 10);
      nextNumber = lastNum + 1;
    }
    const requestNumber = `TRQ_${nextNumber}`;

    // 2) Extract fields from req.body
    const {
      companyName,
      companyAddress,
      pickupLocation,
      pickupContact,     // { name, phone, email }
      deliveryLocation,
      deliveryContact,   // { name, phone, email }
      vehicles           // array of { vin, make, model }
    } = req.body;

    // 3) Create new form doc
    const newForm = new Form({
      user: req.user._id,
      requestNumber,
      companyName,
      companyAddress,
      pickupLocation,
      pickupContact,
      deliveryLocation,
      deliveryContact,
      vehicles, // array from the front-end
      status: 'Submitted'
    });

    const savedForm = await newForm.save();

    // (Optional) Generate Excel, send email, etc.
    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet('Form Submission');
    worksheet.addRow([
      'Request Number',
      'Company Name',
      'Pickup Location',
      'Pickup Contact Name',
      'Pickup Contact Phone',
      'Delivery Location',
      'Delivery Contact Name',
      'Delivery Contact Phone'
    ]);
    worksheet.addRow([
      savedForm.requestNumber,
      savedForm.companyName,
      savedForm.pickupLocation,
      savedForm.pickupContact.name,
      savedForm.pickupContact.phone,
      savedForm.deliveryLocation,
      savedForm.deliveryContact.name,
      savedForm.deliveryContact.phone
    ]);

    // Add a header for vehicles
    worksheet.addRow([]);
    worksheet.addRow(['VIN', 'Make', 'Model']);
    if (Array.isArray(savedForm.vehicles)) {
      savedForm.vehicles.forEach(v => {
        worksheet.addRow([v.vin, v.make, v.model]);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    // Send via nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    await transporter.sendMail({
      from: `"Transport App" <${process.env.EMAIL_USER}>`,
      to: RECIPIENT_EMAIL,
      subject: `New Transport Request - ${savedForm.requestNumber}`,
      text: 'A new transport form was submitted, see attached.',
      attachments: [
        {
          filename: `TransportRequest_${savedForm.requestNumber}.xlsx`,
          content: buffer
        }
      ]
    });

    req.flash('success_msg', 'New transport request submitted!');
    res.redirect('/forms/dashboard');
  } catch (err) {
    console.warn('Error creating new form =>', err);
    req.flash('error_msg', 'Failed to create new request: ' + err.message);
    res.redirect('/forms/new');
  }
});

/**
 * VIN Lookup for a single VIN. 
 * Users can call this for each VIN row to auto-fill make/model.
 */
router.get('/vin-lookup/:vin', ensureAuthenticated, async (req, res) => {
  try {
    const { vin } = req.params;
    const { make, model } = await vinLookupService.lookupVIN(vin);
    return res.json({ make, model });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'VIN lookup failed' });
  }
});

/**
 * Quote Acceptance / Decline
 * Same logic as before, but included for completeness
 */
router.post('/accept-quote/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) {
      throw new Error('Unauthorized');
    }

    form.status = 'Accepted';
    await form.save();

    req.flash('success_msg', 'Quote accepted. Please select payment method.');
    res.redirect('/forms/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not accept quote.');
    res.redirect('/forms/dashboard');
  }
});

/**
 * Decline => Cancel or Re-quote
 */
router.post('/decline-quote/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) {
      throw new Error('Unauthorized');
    }

    const { action } = req.body; // 'cancel' or 'requote'
    if (action === 'cancel') {
      form.status = 'Cancelled';
      await form.save();
      req.flash('success_msg', 'Order cancelled.');
    } else if (action === 'requote') {
      form.status = 'Re-quote';
      await form.save();
      req.flash('success_msg', 'Order set to re-quote. Please update details.');
      return res.redirect(`/forms/edit/${req.params.formId}`);
    }
    return res.redirect('/forms/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not decline quote.');
    res.redirect('/forms/dashboard');
  }
});

/**
 * GET /forms/edit/:formId
 * If user wants to adjust details after a re-quote
 */
router.get('/edit/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) {
      throw new Error('Unauthorized');
    }
    // Render an editForm page
    res.render('editForm', { form });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to load edit form.');
    res.redirect('/forms/dashboard');
  }
});

/**
 * POST /forms/edit/:formId
 * Update the form details if user wants to re-submit
 */
router.post('/edit/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) {
      throw new Error('Unauthorized');
    }

    // e.g. allow updating pickupLocation, deliveryLocation, vehicles...
    form.pickupLocation = req.body.pickupLocation;
    form.pickupContact = req.body.pickupContact;
    form.deliveryLocation = req.body.deliveryLocation;
    form.deliveryContact = req.body.deliveryContact;
    form.vehicles = req.body.vehicles; // array of objects
    form.status = 'Submitted'; // reset to submitted so admin can re-quote

    await form.save();
    req.flash('success_msg', 'Order updated. Awaiting a new quote.');
    res.redirect('/forms/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to update form.');
    res.redirect('/forms/dashboard');
  }
});

/**
 * Payment Endpoints:
 *  1) Credit Card => Stripe Checkout
 *  2) ACH => direct debit placeholder
 *  3) Payment success
 */

// 1) Credit Card
// In routes/form.js
router.post('/pay-credit-card/:formId', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Fetch the form and confirm it exists
    const form = await Form.findById(req.params.formId);
    if (!form) {
      throw new Error('Form not found.');
    }

    // 2) Parse the price from form
    const numericPrice = parseFloat(form.price);
    if (isNaN(numericPrice)) {
      throw new Error('Price is invalid or missing. Please contact admin.');
    }

    // 3) Convert to cents
    const unitAmount = Math.round(numericPrice * 100);
    // If total is 0 or less, block the session creation
    if (unitAmount <= 0) {
      throw new Error('Cannot create a $0 payment session. Please contact admin to set a valid price.');
    }

    // 4) Build a product description
    const productName = `Transport Request #${form.requestNumber}`;

    // 5) Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: productName },
            unit_amount: unitAmount
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/forms/payment-success/${form._id}`,
      cancel_url: `${req.headers.origin}/forms/dashboard`
    });

    // 6) Redirect to Stripe
    res.redirect(session.url);

  } catch (err) {
    console.error('Error initiating card payment:', err);
    req.flash('error_msg', err.message || 'Payment failed.');
    res.redirect('/forms/dashboard');
  }
});

// 2) ACH (placeholder for US bank account direct debit)
router.get('/pay-ach/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) throw new Error('Unauthorized');
    if (form.status !== 'Accepted') throw new Error('Order not accepted yet');

    // Render a page (achPaymentForm.ejs) to collect bank info via Stripe's US bank account approach
    res.render('achPaymentForm', { form });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error initiating ACH payment.');
    res.redirect('/forms/dashboard');
  }
});

// Optionally POST /pay-ach/:formId => create PaymentIntent, confirm, etc.
// 3) Payment Success
router.get('/payment-success/:formId', ensureAuthenticated, async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) throw new Error('Form not found');
    if (String(form.user) !== String(req.user._id)) throw new Error('Unauthorized');

    form.status = 'Paid';
    form.isPaid = true;
    await form.save();

    req.flash('success_msg', 'Payment successful!');
    res.redirect('/forms/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error finalizing payment.');
    res.redirect('/forms/dashboard');
  }
});

module.exports = router;