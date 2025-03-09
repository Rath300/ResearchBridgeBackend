import express from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { PrismaClient } from "@prisma/client"
import { authenticateToken } from "../middleware/auth"

const router = express.Router()
const prisma = new PrismaClient()

// Register a new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, school, grade, location } = req.body

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        school,
        grade,
        location,
        interests: [],
        skills: [],
      },
    })

    // Create JWT
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "your_jwt_secret", {
      expiresIn: "7d",
    })

    // Return user data without password
    const { password: _, ...userData } = user
    res.status(201).json({
      user: userData,
      token,
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Server error during registration" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password || "")
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Create JWT
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "your_jwt_secret", {
      expiresIn: "7d",
    })

    // Return user data without password
    const { password: _, ...userData } = user
    res.json({
      user: userData,
      token,
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error during login" })
  }
})

// Get current user
router.get("/me", authenticateToken, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        school: true,
        grade: true,
        location: true,
        bio: true,
        interests: true,
        skills: true,
        availability: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json(user)
  } catch (error) {
    console.error("Get current user error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

