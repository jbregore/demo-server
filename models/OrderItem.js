const mongoose = require('mongoose');

const InventorySchema = mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'order',
        required: true
    },
    inventory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'inventory',
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('orderItem', InventorySchema);