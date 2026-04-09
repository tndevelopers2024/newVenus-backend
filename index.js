const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = [
    'http://localhost:5173',
    'https://new-venus-clinic.vercel.app',
    'https://newvenusclinic.online',
    'https://www.newvenusclinic.online',
    'https://new-venus-clinic-git-main-tndevelopers2024s-projects.vercel.app' // Extra vercel preview just in case
];

// Conflict-Avoiding CORS Middleware
app.use((req, res, next) => {
    const rawOrigin = req.headers.origin;
    
    // Handle cases where the proxy might duplicate the Origin header
    // e.g. "https://domain.com, https://domain.com"
    const origin = rawOrigin ? rawOrigin.split(',')[0].trim() : null;

    const isAllowed = !origin || 
                      allowedOrigins.includes(origin) || 
                      origin.endsWith('.vercel.app') || 
                      origin.includes('vercel.app') ||
                      origin.includes('localhost');

    if (isAllowed && origin) {
        // Only set header if NOT already set by Proxy (OpenLiteSpeed/Nginx)
        if (!res.getHeader('Access-Control-Allow-Origin')) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    }
    
    // Handle Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// app.options() is no longer needed as app.use(cors()) handles OPTIONS automatically
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Serve static files
app.use('/uploads', express.static(uploadsDir));

// Database connection
const connectDB = async () => {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@') : 'undefined');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    }
};

connectDB();

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Venus Healthcare Portal API' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/doctor', require('./routes/doctorRoutes'));
app.use('/api/patient', require('./routes/patientRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Error Handling Middleware
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5003;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const io = require('./socket').init(server);
io.on('connection', socket => {
    console.log('Client connected');
});
