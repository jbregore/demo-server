const mongoose = require('mongoose');

const ProductSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    productCode: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    stock: {
      type: Number,
      default: 0
    },
    size: {
      type: String,
      default: ''
    },
    color: {
      type: String,
      default: ''
    },
    availability: {
      type: Boolean,
      default: true
    },
    vatable: {
      type: Boolean,
      default: true
    },
    barCode: {
      type: String,
      default: ''
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
