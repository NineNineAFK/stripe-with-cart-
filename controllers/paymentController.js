require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Order Model
const Order = mongoose.model('Order', new mongoose.Schema({
    productId: String,
    amount: Number,
    currency: String,
    status: String,
    paymentIntentId: String
}));

// Stripe Checkout Endpoint
app.post('/create-checkout-session', async (req, res) => {
    const { productId } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: productId, // Stripe Price ID
                quantity: 1
            }],
            mode: 'payment',
            success_url: 'http://localhost:3000/success',
            cancel_url: 'http://localhost:3000/cancel'
        });

        res.json({ id: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stripe Webhook for Payment Confirmation
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle successful payment
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const newOrder = new Order({
            productId: session.line_items[0].price.id,
            amount: session.amount_total,
            currency: session.currency,
            status: session.payment_status,
            paymentIntentId: session.payment_intent
        });

        await newOrder.save();
    }

    res.json({ received: true });
});

// Start Server
app.listen(4242, () => console.log('Server running on port 4242'));
