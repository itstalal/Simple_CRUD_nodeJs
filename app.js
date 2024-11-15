const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const { User, Product, Cart } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb://localhost:27017/react-node-app')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));


app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/react-node-app' })
}));

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.role === 'admin') {
        next();
    } else {
        res.redirect('/');
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send('Username already exists, please choose a different one.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred during registration. Please try again later.');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        req.session.role = user.role;
        res.redirect(user.role === 'admin' ? '/admin' : '/client');
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// Admin Routes
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    const products = await Product.find();
    const users = await User.find();
    res.render('admin', { products, users });
});

app.post('/admin/add-product', isAuthenticated, isAdmin, async (req, res) => {
    const { name, price, description } = req.body;
    await Product.create({ name, price, description });
    res.redirect('/admin');
});

app.post('/admin/edit-product/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, price, description } = req.body;
    await Product.findByIdAndUpdate(id, { name, price, description });
    res.redirect('/admin');
});

app.post('/admin/delete-product/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    await Product.findByIdAndDelete(id);
    res.redirect('/admin');
});

app.post('/admin/edit-user/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, role } = req.body;
    await User.findByIdAndUpdate(id, { username, role });
    res.redirect('/admin');
});

app.post('/admin/delete-user/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.redirect('/admin');
});

// Client Routes
app.get('/client', isAuthenticated, async (req, res) => {
    const products = await Product.find();
    const cart = await Cart.findOne({ userId: req.session.userId });
    res.render('client', { products, cart });
});

// Client add-to-cart
app.post('/client/add-to-cart', isAuthenticated, async (req, res) => {
    const { productId, quantity } = req.body;
  
    try {
      // Recherchez le panier de l'utilisateur actuel
      let cart = await Cart.findOne({ userId: req.session.userId }).exec();
  
      // Convertissez productId en ObjectId
      const productObjectId = new mongoose.Types.ObjectId(productId);
  
      if (cart) {
        // Trouvez l'article dans le panier
        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productObjectId.toString());
  
        if (itemIndex !== -1) {
          // Si l'article existe déjà, mettez à jour la quantité
          cart.items[itemIndex].quantity += parseInt(quantity, 10);
        } else {
          // Si l'article n'existe pas, ajoutez-le au panier
          cart.items.push({ productId: productObjectId, quantity: parseInt(quantity, 10) });
        }
  
        // Enregistrez les modifications du panier
        await cart.save();
      } else {
        // Créez un nouveau panier si aucun n'existe pour cet utilisateur
        cart = new Cart({
          userId: req.session.userId,
          items: [{ productId: productObjectId, quantity: parseInt(quantity, 10) }]
        });
  
        await cart.save();
      }
  
      // Redirigez vers la page client après ajout au panier
      res.redirect('/client/cart');
    } catch (err) {
      console.error('Error adding to cart:', err);
      res.status(500).send('An error occurred.');
    }
  });

  app.get('/client/cart', isAuthenticated, async (req, res) => {
    // Utilisez populate pour remplir les informations des produits dans le panier
    const cart = await Cart.findOne({ userId: req.session.userId }).populate('items.productId');
    res.render('cart', { cart });
});

// supprimer un produit 
app.post('/client/remove-from-cart/:productId', isAuthenticated, async (req, res) => {
    const { productId } = req.params;

    try {
       
        let cart = await Cart.findOne({ userId: req.session.userId }).exec();

        if (cart) {
            
            const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

            if (itemIndex !== -1) {
                
                cart.items.splice(itemIndex, 1);

                
                await cart.save();
            }

            
            res.redirect('/client/cart');
        } else {
            res.status(404).send('Cart not found');
        }
    } catch (err) {
        console.error('Error removing item from cart:', err);
        res.status(500).send('An error occurred.');
    }
});











// Function to create admin user if it doesn't exist
const createAdminIfNotExists = async () => {
    const adminUsername = 'admin';
    const adminPassword = 'admin'; 

    try {
        const existingAdmin = await User.findOne({ username: adminUsername });
        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await User.create({ username: adminUsername, password: hashedPassword, role: 'admin' });
            console.log('Admin user created successfully.');
        } else {
            console.log('Admin user already exists.');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
};

createAdminIfNotExists();

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
