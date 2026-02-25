const express = require("express");
const app = express();
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const db = require("./config/db"); 
const jwt = require("jsonwebtoken");

app.use(cors({ origin: ["http://localhost:3000", "http://localhost:3001"], credentials: true }));
app.use(express.json());
app.use('/images', express.static('upload/images'));

const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
});
const upload = multer({storage: storage});

app.post("/upload", upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: 0, message: "No file uploaded" });
    }
    res.json({
        success: 1,
        image_url: `http://localhost:5000/images/${req.file.filename}`
    });
});

const initDB = async () => {
    try {
        const productTable = `CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            name VARCHAR(255), 
            image VARCHAR(255), 
            category VARCHAR(100), 
            new_price DECIMAL(10,2), 
            old_price DECIMAL(10,2),
            description TEXT, 
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        const userTable = `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            name VARCHAR(100), 
            email VARCHAR(100) UNIQUE, 
            password VARCHAR(100), 
            cartData TEXT, 
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;
        
        const orderTable = `CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            address VARCHAR(255),
            phone VARCHAR(20),
            amount DECIMAL(10,2),
            status VARCHAR(50) DEFAULT 'Pending',
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        await db.query(productTable);
        await db.query(userTable); 
        await db.query(orderTable);
        console.log("✅ All Tables (Products, Users & Orders) are Ready!");
    } catch (err) {
        console.log("❌ DB Error: " + err.message);
    }
};
initDB();

app.post('/addproduct', async (req, res) => {
    const { name, image, category, new_price, old_price, description } = req.body;
    try {
        const sql = "INSERT INTO products (name, image, category, new_price, old_price, description) VALUES (?, ?, ?, ?, ?, ?)";
        await db.query(sql, [name, image, category, new_price, old_price, description]);
        res.json({ success: true, name: name });
    } catch (err) {
        console.error("Insert Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [existingUser] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, errors: "Existing user found with this email" });
        }
        let cart = {};
        for (let i = 0; i < 301; i++) { cart[i] = 0; }

        const sql = "INSERT INTO users (name, email, password, cartData) VALUES (?, ?, ?, ?)";
        const [result] = await db.query(sql, [username, email, password, JSON.stringify(cart)]);
        const token = jwt.sign({ id: result.insertId }, 'secret_ecom');
        res.json({ success: true, token });
    } catch (err) {
        res.status(500).json({ success: false, errors: "Signup Error" });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [user] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (user.length > 0) {
            if (password === user[0].password) {
                const token = jwt.sign({ id: user[0].id }, 'secret_ecom');
                res.json({ success: true, token, userId: user[0].id });   // userId بھی دے رہے ہیں
            } else {
                res.json({ success: false, errors: "Wrong Password" });
            }
        } else {
            res.json({ success: false, errors: "Wrong Email Id" });
        }
    } catch (err) {
        res.status(500).json({ success: false, errors: "Login Error" });
    }
});

app.get('/allproducts', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM products");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/", (req, res) => { res.send("Ammar awan web developer"); });

app.listen(5000, () => console.log("🚀 Server running on Port 5000"));


// ================= CART SYSTEM =================

// Add to Cart Route
app.post('/addtocart', async (req, res) => {
    const { userId, itemId } = req.body;
    try {
        const [rows] = await db.query("SELECT cartData FROM users WHERE id = ?", [userId]);
        let cart = rows[0].cartData ? JSON.parse(rows[0].cartData) : {};

        cart[itemId] = (cart[itemId] || 0) + 1;

        await db.query("UPDATE users SET cartData = ? WHERE id = ?", [JSON.stringify(cart), userId]);

        console.log("Added to cart", itemId);
        res.send("Added Successfully");
    } catch (err) {
        res.status(500).send("Add to cart error");
    }
});

// Remove from Cart Route
app.post('/removefromcart', async (req, res) => {
    const { userId, itemId } = req.body;
    try {
        const [rows] = await db.query("SELECT cartData FROM users WHERE id = ?", [userId]);
        let cart = rows[0].cartData ? JSON.parse(rows[0].cartData) : {};

        if(cart[itemId] > 0){
            cart[itemId] -= 1;
        }

        await db.query("UPDATE users SET cartData = ? WHERE id = ?", [JSON.stringify(cart), userId]);

        console.log("Removed from cart", itemId);
        res.send("Removed Successfully");
    } catch (err) {
        res.status(500).send("Remove cart error");
    }
});

// Get Cart Route
app.post('/getcart', async (req, res) => {
    const { userId } = req.body;
    try {
        const [rows] = await db.query("SELECT cartData FROM users WHERE id = ?", [userId]);
        if(rows.length > 0){
            res.json(rows[0].cartData ? JSON.parse(rows[0].cartData) : {});
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({});
    }
});

// ================= ORDER =================
app.post('/placeorder', async (req, res) => {
    const { name, address, phone, amount } = req.body;
    try {
        const sql = "INSERT INTO orders (name, address, phone, amount) VALUES (?, ?, ?, ?)";
        await db.query(sql, [name, address, phone, amount]);
        res.json({ success: true, message: "Order Placed Successfully ✅" });
    } catch (err) {
        console.error("Order Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error while placing order ❌" });
    }
});