import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { createServer } from "http"
import { Server } from "socket.io"
import cookieParser from "cookie-parser"
import { PrismaClient } from "@prisma/client"
import path from "path"
import helmet from "helmet"
import rateLimit from "express-rate-limit"

// Routes
import authRoutes from "./routes/auth"
import userRoutes from "./routes/users"
import projectRoutes from "./routes/projects"
import collaborationRoutes from "./routes/collaboration"
import guildRoutes from "./routes/guilds"
import mentorRoutes from "./routes/mentors"
import messageRoutes from "./routes/messages"
import searchRoutes from "./routes/search"
import aiRoutes from "./routes/ai"

// Middleware
import { authenticateToken } from "./middleware/auth"

// Initialize
dotenv.config()
const app = express()
const httpServer = createServer(app)

// Socket.io setup with optimized settings for free hosting
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
})

const prisma = new PrismaClient()

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})

// Apply to all requests
app.use(limiter)

// More strict rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

// Middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Make Prisma available in request
app.use((req: any, res, next) => {
  req.prisma = prisma
  next()
})

// Routes
app.use("/api/auth", authLimiter, authRoutes)
app.use("/api/users", authenticateToken, userRoutes)
app.use("/api/projects", authenticateToken, projectRoutes)
app.use("/api/collaboration", authenticateToken, collaborationRoutes)
app.use("/api/guilds", authenticateToken, guildRoutes)
app.use("/api/mentors", authenticateToken, mentorRoutes)
app.use("/api/messages", authenticateToken, messageRoutes)
app.use("/api/search", authenticateToken, searchRoutes)
app.use("/api/ai", authenticateToken, aiRoutes)

// Socket.io setup
import { setupSocketHandlers } from "./socket"
setupSocketHandlers(io, prisma)

// Health check for monitoring and keeping the service awake
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Start server
const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully")
  await prisma.$disconnect()
  httpServer.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

