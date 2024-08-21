require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const URL = process.env.URL;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRODUCT_ID_1 = process.env.PRODUCT_ID_1;
const PRODUCT_ID_2 = process.env.PRODUCT_ID_2;
const app = express();

// Middleware to parse URL-encoded data from forms
app.use(express.urlencoded({ extended: true }));

const BUY_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shop</title>
    <style>
      input[type="submit"], button {
        height: 40px;
        width: 200px;
        border: none;
        border-radius: 5px;
        background-color: #0070f3;
        color: #fff;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 10px;
      }
      .product {
        margin-bottom: 20px;
      }
    </style>
  </head>
  <body>
    <div class="product">
      <h2>Product 1 - $10</h2>
      <form action="/add-to-cart" method="POST">
        <input type="hidden" name="productName" value="WittCepter Product 1">
        <input type="hidden" name="priceId" value="${PRODUCT_ID_1}">
        <input type="submit" value="Add to Cart">
      </form>
    </div>
    <div class="product">
      <h2>Product 2 - $20</h2>
      <form action="/add-to-cart" method="POST">
        <input type="hidden" name="productName" value="WittCepter Product 2">
        <input type="hidden" name="priceId" value="${PRODUCT_ID_2}">
        <input type="submit" value="Add to Cart">
      </form>
    </div>
    <button onclick="location.href='/cart'">Visit Cart</button>
  </body>
  </html>`;

app.get("/", (req, res) => {
  res.send(BUY_HTML);
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));


// order schema
const Order = mongoose.model('Order', new mongoose.Schema({
  productId: { type: String,  },
  productName: { type: String,  },
  amount: { type: Number,  },
  currency: { type: String,  },
  status: { type: String,  },
  paymentIntentId: { type: String },
  customerEmail: { type: String,  },
  customerName: { type: String,  },
  paymentMethodTypes: { type: [String],  },
  purchasedAt: { type: Date, default: Date.now } 
}));  

// Cart Schema
const cartSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [{
    productName: { type: String, required: true },
    priceId: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 }
  }],
  totalAmount: { type: Number, required: true, default: 0 },
});

const Cart = mongoose.model('Cart', cartSchema);

// Add to Cart Route
app.post('/add-to-cart', async (req, res) => {
  const { productName, priceId } = req.body;

  let cart = await Cart.findOne({ userId: "default_user" });

  if (!cart) {
    cart = new Cart({ userId: "default_user", items: [], totalAmount: 0 });
  }

  const itemIndex = cart.items.findIndex(item => item.productName === productName);

  if (itemIndex > -1) {
    cart.items[itemIndex].quantity += 1;
  } else {
    cart.items.push({ productName, priceId });
  }

  await cart.save();
  res.redirect('/');
});

// View Cart Route
app.get('/cart', async (req, res) => {
  const cart = await Cart.findOne({ userId: "default_user" });

  if (!cart) {
    return res.send('<h1>Your cart is empty.</h1>');
  }

  let cartHTML = `<h1>Your Cart</h1><ul>`;
  cart.items.forEach(item => {
    cartHTML += `<li>${item.productName} - x ${item.quantity}</li>`;
  });
  cartHTML += `</ul>`;
  cartHTML += `<form action="/checkout" method="POST"><input type="submit" value="Buy Now"></form>`;

  res.send(cartHTML);
});

// Checkout Route
app.post('/checkout', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: "default_user" });

    if (!cart || cart.items.length === 0) {
      return res.send('<h1>Your cart is empty.</h1>');
    }

    const lineItems = cart.items.map(item => ({
      price: item.priceId,
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${URL}/cancel`
    });

    res.redirect(session.url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe Webhook for Payment Confirmation and db logging after confirming events
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const sessionDetails = await stripe.checkout.sessions.retrieve(session.id);

      console.log('Checkout session completed!', sessionDetails);

      // Saving order details to the database
      const order = new Order({
        productId: session.id,
        productName: session.metadata.productName, // Access the product name from metadata (if available)
        amount: session.amount_total,
        currency: session.currency,
        status: session.payment_status,
        paymentIntentId: session.payment_intent,
        customerEmail: session.customer_details.email,
        customerName: session.customer_details.name,
        paymentMethodTypes: session.payment_method_types,
        purchasedAt: new Date()
      });

      await order.save();
      console.log('Order saved:', order);

      // Clear the cart after successful checkout
      await Cart.findOneAndDelete({ userId: "default_user" });

    } else {
      console.log('Unhandled event type:', event.type);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error handling webhook event:', err.message);
    res.sendStatus(400);
  }
});

app.get('/success', async (req, res) => {
  res.send(`<html><body><h1>Thanks for your order, </h1></body></html>`);
});

app.get('/cancel', (req, res) => {
  res.send('<h1>Cancelled</h1>');
});

// Start Server
app.listen(3000, () => console.log('Server running on port 3000'));
