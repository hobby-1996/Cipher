import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import Stripe from 'stripe';

async function startServer() {
  console.log('Starting server...');
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      
      // Check if key is missing or a placeholder
      if (!stripeKey || stripeKey === 'sk_test_...' || stripeKey === '123456') {
        return res.status(400).json({ 
          error: 'Stripe is not configured. Please set a valid STRIPE_SECRET_KEY in the AI Studio Secrets panel.' 
        });
      }
      
      const stripe = new Stripe(stripeKey);
      
      const { userId } = req.body;
      
      // We use the referrer or a default URL for success/cancel
      const domain = req.headers.origin || `http://localhost:${PORT}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'inr',
              product_data: {
                name: 'Premium Membership',
                description: 'One-time fee for premium features.',
              },
              unit_amount: 299900, // 2999 INR in paise
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${domain}?payment_success=true&user_id=${userId}`,
        cancel_url: `${domain}?payment_canceled=true`,
        client_reference_id: userId,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
