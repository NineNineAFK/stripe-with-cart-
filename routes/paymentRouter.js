const express = require('express');
const { createPaymentIntent, confirmPayment, handleWebhook } = require('../controllers/paymentController');

const router = express.Router();

router.post('/create-payment-intent', createPaymentIntent);
router.post('/confirm-payment', confirmPayment);
router.post('/webhook', express.raw({type: 'application/json'}), handleWebhook); // Stripe requires raw body for webhooks

module.exports = router;
