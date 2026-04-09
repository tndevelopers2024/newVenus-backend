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

app.use(cors({
    origin: function (origin, callback) {
        console.log('[DEBUG] CORS Request Origin:', origin);
        
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.includes(origin) || 
                         origin.endsWith('.vercel.app') || 
                         origin.includes('vercel.app') ||
                         origin.includes('localhost');

        if (isAllowed) {
            console.log('[DEBUG] CORS Status: ALLOWED');
            callback(null, true);
        } else {
            console.warn('[DEBUG] CORS Status: REJECTED', origin);
            // Instead of throwing an error which might strip headers, 
            // just return false to let the cors middleware handle it standardly
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // Cache preflight for 24 hours
}));

// Explicitly handle pre-flight requests
app.options('*', cors());
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
