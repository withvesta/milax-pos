const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to read database
function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // Return default if file doesn't exist (failsafe)
      return { adminPassword: "MilaxKK", stock: [], services: [], transactions: [] };
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file:", err);
    return { adminPassword: "MilaxKK", stock: [], services: [], transactions: [] };
  }
}

// Helper function to write database
function writeDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Error writing database file:", err);
    return false;
  }
}

// Middleware to verify admin password
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  const db = readDB();
  if (!password || password !== db.adminPassword) {
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid or missing administrator password." });
  }
  next();
}

// --- Public Endpoints ---

// Get all stock items
app.get('/api/stock', (req, res) => {
  const db = readDB();
  res.json(db.stock);
});

// Get all services
app.get('/api/services', (req, res) => {
  const db = readDB();
  res.json(db.services);
});

// Customer Checkout (Stock Purchase)
app.post('/api/checkout', (req, res) => {
  const { customer, items } = req.body;
  
  if (!customer || !customer.firstName || !customer.lastName || !customer.phone || !customer.location) {
    return res.status(400).json({ success: false, message: "Missing customer details (names, phone, location)." });
  }
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Your cart is empty." });
  }
  
  const db = readDB();
  const purchasedItems = [];
  let grandTotal = 0;
  
  // Verify stock and calculate totals
  for (const cartItem of items) {
    const stockItem = db.stock.find(i => i.id === cartItem.id);
    if (!stockItem) {
      return res.status(400).json({ success: false, message: `Item '${cartItem.name}' is no longer in stock.` });
    }
    if (stockItem.quantity < cartItem.quantity) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock for '${stockItem.name}'. Available: ${stockItem.quantity}, Requested: ${cartItem.quantity}` 
      });
    }
    
    purchasedItems.push({
      id: stockItem.id,
      name: stockItem.name,
      price: stockItem.price,
      quantity: cartItem.quantity,
      total: stockItem.price * cartItem.quantity
    });
    
    grandTotal += stockItem.price * cartItem.quantity;
  }
  
  // Deduct stock quantities
  for (const cartItem of items) {
    const stockItem = db.stock.find(i => i.id === cartItem.id);
    stockItem.quantity -= cartItem.quantity;
  }
  
  // Log transaction
  const transaction = {
    id: 'TXN_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      location: customer.location
    },
    type: "sale",
    items: purchasedItems,
    total: grandTotal
  };
  
  db.transactions.unshift(transaction); // Add to beginning
  writeDB(db);
  
  res.json({ success: true, transactionId: transaction.id, total: grandTotal });
});

// Customer Service Booking
app.post('/api/book-service', (req, res) => {
  const { customer, serviceId, notes } = req.body;
  
  if (!customer || !customer.firstName || !customer.lastName || !customer.phone || !customer.location) {
    return res.status(400).json({ success: false, message: "Missing customer details (names, phone, location)." });
  }
  
  if (!serviceId) {
    return res.status(400).json({ success: false, message: "No service selected." });
  }
  
  const db = readDB();
  const service = db.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Selected service does not exist." });
  }
  
  // Log service transaction
  const transaction = {
    id: 'SRV_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      location: customer.location
    },
    type: "service",
    service: {
      id: service.id,
      name: service.name,
      price: service.price,
      notes: notes || ""
    },
    total: service.price
  };
  
  db.transactions.unshift(transaction);
  writeDB(db);
  
  res.json({ success: true, transactionId: transaction.id, serviceName: service.name, total: service.price });
});

// --- Admin Endpoints (Require Password Authentication) ---

// Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const db = readDB();
  if (password === db.adminPassword) {
    res.json({ success: true, message: "Authentication successful." });
  } else {
    res.status(401).json({ success: false, message: "Incorrect password." });
  }
});

// Get transactions log
app.get('/api/admin/transactions', adminAuth, (req, res) => {
  const db = readDB();
  res.json(db.transactions);
});

// Add new stock item
app.post('/api/admin/stock', adminAuth, (req, res) => {
  const { name, price, quantity } = req.body;
  
  if (!name || price === undefined || quantity === undefined) {
    return res.status(400).json({ success: false, message: "Please specify item name, price, and quantity." });
  }
  
  const parsedPrice = parseFloat(price);
  const parsedQuantity = parseInt(quantity);
  
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ success: false, message: "Price must be a valid positive number." });
  }
  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    return res.status(400).json({ success: false, message: "Quantity must be a valid non-negative integer." });
  }
  
  const db = readDB();
  const newItem = {
    id: 'item_' + Date.now(),
    name: name.trim(),
    price: parsedPrice,
    quantity: parsedQuantity
  };
  
  db.stock.push(newItem);
  writeDB(db);
  
  res.json({ success: true, item: newItem });
});

// Delete stock item
app.delete('/api/admin/stock/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const initialLength = db.stock.length;
  
  db.stock = db.stock.filter(item => item.id !== id);
  
  if (db.stock.length === initialLength) {
    return res.status(404).json({ success: false, message: "Item not found." });
  }
  
  writeDB(db);
  res.json({ success: true, message: "Item deleted successfully." });
});

// Add new service
app.post('/api/admin/services', adminAuth, (req, res) => {
  const { name, description, price } = req.body;
  
  if (!name || price === undefined) {
    return res.status(400).json({ success: false, message: "Please specify service name and price." });
  }
  
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ success: false, message: "Price must be a valid positive number." });
  }
  
  const db = readDB();
  const newService = {
    id: 'service_' + Date.now(),
    name: name.trim(),
    description: (description || "").trim(),
    price: parsedPrice
  };
  
  db.services.push(newService);
  writeDB(db);
  
  res.json({ success: true, service: newService });
});

// Delete service
app.delete('/api/admin/services/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const initialLength = db.services.length;
  
  db.services = db.services.filter(s => s.id !== id);
  
  if (db.services.length === initialLength) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }
  
  writeDB(db);
  res.json({ success: true, message: "Service deleted successfully." });
});

// Change admin password
app.post('/api/admin/change-password', adminAuth, (req, res) => {
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.trim().length === 0) {
    return res.status(400).json({ success: false, message: "Password cannot be empty." });
  }
  
  const db = readDB();
  db.adminPassword = newPassword.trim();
  writeDB(db);
  
  res.json({ success: true, message: "Password updated successfully." });
});

app.listen(PORT, () => {
  console.log(`Milax Enterprises POS server running at http://localhost:${PORT}`);
});
