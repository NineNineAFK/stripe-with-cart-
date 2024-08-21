const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    paymentIntentId: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        required: true,
    },
    method: {
        type: String,
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
