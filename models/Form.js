// models/Form.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VehicleSchema = new Schema({
  vin: { type: String },
  make: { type: String },
  model: { type: String }
});

const ContactSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String } // optional
});

const FormSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  requestNumber: {
    type: String,
    required: true,
    unique: true
  },
  companyName: String,
  companyAddress: String,

  pickupLocation: String,
  pickupContact: ContactSchema,      // { name, phone, email }
  
  deliveryLocation: String,
  deliveryContact: ContactSchema,    // { name, phone, email }

  vehicles: [VehicleSchema],         // array of { vin, make, model }

  status: { type: String, default: 'Submitted' },
  isPaid: { type: Boolean, default: false },
  owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Form', FormSchema);