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
    'https://www.newvenusclinic.online'
];

// Debug Middleware to see what's hitting the server
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
    next();
});

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        // Handle comma-separated origins (sometimes happens with proxies like OpenLiteSpeed)
        const origins = origin.split(',').map(o => o.trim());
        const matchedOrigin = origins.find(o => allowedOrigins.includes(o));

        if (matchedOrigin) {
            callback(null, matchedOrigin);
        } else {
            console.log(`[CORS] Rejected Origin: ${origin}`);
            // Still allow with echoing back to help debug what the browser sees
            callback(null, origins[0]);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));
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
