import express from "express"
import { PrismaClient } from "@prisma/client"
import multer from "multer"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const router = express.Router()
const prisma = new PrismaClient()

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

// Configure multer for memory storage (for Supabase upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (ext && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error("Only images are allowed"))
    }
  },
})

// Get all users (with pagination and filtering)
router.get("/", async (req: any, res) => {
  try {
    const { page = 1, limit = 10, search, interests, skills } = req.query
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    // Build filter conditions
    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { bio: { contains: search, mode: "insensitive" } },
        { school: { contains: search, mode: "insensitive" } },
      ]
    }

    if (interests) {
      const interestArray = Array.isArray(interests) ? interests : [interests]
      where.interests = { hasSome: interestArray }
    }

    if (skills) {
      const skillsArray = Array.isArray(skills) ? skills : [skills]
      where.skills = { hasSome: skillsArray }
    }

    // Get users
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar: true,
        school: true,
        grade: true,
        location: true,
        bio: true,
        interests: true,
        skills: true,
        availability: true,
      },
      skip,
      take: Number.parseInt(limit),
      orderBy: { createdAt: "desc" },
    })

    // Get total count for pagination
    const total = await prisma.user.count({ where })

    res.json({
      users,
      pagination: {
        total,
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        pages: Math.ceil(total / Number.parseInt(limit)),
      },
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
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
        ownedProjects: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            status: true,
            progress: true,
          },
        },
        articles: {
          select: {
            id: true,
            title: true,
            abstract: true,
            tags: true,
            status: true,
            publishedDate: true,
          },
          where: { status: "PUBLISHED" },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json(user)
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update user profile
router.put("/:id", async (req: any, res) => {
  try {
    const { id } = req.params

    // Check if user is updating their own profile
    if (id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to update this profile" })
    }

    const { name, school, grade, location, bio, interests, skills, availability } = req.body

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        school,
        grade,
        location,
        bio,
        interests,
        skills,
        availability,
      },
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
        updatedAt: true,
      },
    })

    res.json(updatedUser)
  } catch (error) {
    console.error("Update user error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Upload avatar to Supabase Storage
router.post("/avatar", upload.single("avatar"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    // Upload to Supabase Storage
    const fileBuffer = req.file.buffer
    const fileName = `avatars/${req.user.id}-${Date.now()}.${req.file.originalname.split(".").pop()}`

    const { data, error } = await supabase.storage.from("researchbridge").upload(fileName, fileBuffer, {
      contentType: req.file.mimetype,
      upsert: true,
    })

    if (error) {
      throw error
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("researchbridge").getPublicUrl(fileName)

    const avatarUrl = urlData.publicUrl

    // Update user with new avatar URL
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: avatarUrl },
      select: { id: true, avatar: true },
    })

    res.json({ avatar: updatedUser.avatar })
  } catch (error) {
    console.error("Avatar upload error:", error)
    res.status(500).json({ error: "Server error during avatar upload" })
  }
})

// Get user's projects
router.get("/:id/projects", async (req, res) => {
  try {
    const { id } = req.params

    const projects = await prisma.project.findMany({
      where: {
        OR: [{ ownerId: id }, { members: { some: { userId: id } } }],
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
      },
    })

    res.json(projects)
  } catch (error) {
    console.error("Get user projects error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user's articles
router.get("/:id/articles", async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.query

    const where: any = { authorId: id }

    if (status) {
      where.status = status
    }

    const articles = await prisma.article.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, avatar: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    res.json(articles)
  } catch (error) {
    console.error("Get user articles error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

