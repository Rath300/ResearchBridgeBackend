import express from "express"
import { PrismaClient } from "@prisma/client"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

const router = express.Router()
const prisma = new PrismaClient()

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

// Create a new project
router.post("/", async (req: any, res) => {
  try {
    const { title, description, category, visibility } = req.body

    // Create project
    const project = await prisma.project.create({
      data: {
        title,
        description,
        category,
        visibility: visibility || "PUBLIC",
        owner: { connect: { id: req.user.id } },
        members: {
          create: {
            role: "LEADER",
            user: { connect: { id: req.user.id } },
          },
        },
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

    res.status(201).json(project)
  } catch (error) {
    console.error("Create project error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get all projects (with pagination and filtering)
router.get("/", async (req: any, res) => {
  try {
    const { page = 1, limit = 10, search, category, status } = req.query
    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)

    // Build filter conditions
    const where: any = {}

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) {
      const categoryArray = Array.isArray(category) ? category : [category]
      where.category = { hasSome: categoryArray }
    }

    if (status) {
      where.status = status
    }

    // Get projects
    const projects = await prisma.project.findMany({
      where,
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
        _count: {
          select: { documents: true },
        },
      },
      skip,
      take: Number.parseInt(limit as string),
      orderBy: { createdAt: "desc" },
    })

    // Get total count for pagination
    const total = await prisma.project.count({ where })

    res.json({
      projects,
      pagination: {
        total,
        page: Number.parseInt(page as string),
        limit: Number.parseInt(limit as string),
        pages: Math.ceil(total / Number.parseInt(limit as string)),
      },
    })
  } catch (error) {
    console.error("Get projects error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get project by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const project = await prisma.project.findUnique({
      where: { id },
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
        documents: {
          select: {
            id: true,
            title: true,
            type: true,
            updatedAt: true,
            author: {
              select: { id: true, name: true },
            },
          },
        },
        timeline: true,
        guild: {
          select: { id: true, name: true },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    res.json(project)
  } catch (error) {
    console.error("Get project error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update project
router.put("/:id", async (req: any, res) => {
  try {
    const { id } = req.params
    const { title, description, category, status, progress, visibility } = req.body

    // Check if user is project owner or leader
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          where: {
            userId: req.user.id,
            role: "LEADER",
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id && project.members.length === 0) {
      return res.status(403).json({ error: "Not authorized to update this project" })
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        title,
        description,
        category,
        status,
        progress,
        visibility,
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

    res.json(updatedProject)
  } catch (error) {
    console.error("Update project error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Delete project
router.delete("/:id", async (req: any, res) => {
  try {
    const { id } = req.params

    // Check if user is project owner
    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to delete this project" })
    }

    // Delete project
    await prisma.project.delete({
      where: { id },
    })

    res.json({ message: "Project deleted successfully" })
  } catch (error) {
    console.error("Delete project error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Add member to project
router.post("/:id/members", async (req: any, res) => {
  try {
    const { id } = req.params
    const { userId, role } = req.body

    // Check if user is project owner or leader
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          where: {
            userId: req.user.id,
            role: "LEADER",
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id && project.members.length === 0) {
      return res.status(403).json({ error: "Not authorized to add members to this project" })
    }

    // Check if user is already a member
    const existingMember = await prisma.projectMember.findFirst({
      where: {
        projectId: id,
        userId,
      },
    })

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this project" })
    }

    // Add member
    const member = await prisma.projectMember.create({
      data: {
        role,
        user: { connect: { id: userId } },
        project: { connect: { id } },
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    res.status(201).json(member)
  } catch (error) {
    console.error("Add member error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Remove member from project
router.delete("/:projectId/members/:userId", async (req: any, res) => {
  try {
    const { projectId, userId } = req.params

    // Check if user is project owner or leader
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          where: {
            userId: req.user.id,
            role: "LEADER",
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id && project.members.length === 0) {
      return res.status(403).json({ error: "Not authorized to remove members from this project" })
    }

    // Remove member
    await prisma.projectMember.deleteMany({
      where: {
        projectId,
        userId,
      },
    })

    res.json({ message: "Member removed successfully" })
  } catch (error) {
    console.error("Remove member error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Add milestone to project
router.post("/:id/milestones", async (req: any, res) => {
  try {
    const { id } = req.params
    const { title, dueDate } = req.body

    // Check if user is project owner or leader
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          where: {
            userId: req.user.id,
            role: "LEADER",
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id && project.members.length === 0) {
      return res.status(403).json({ error: "Not authorized to add milestones to this project" })
    }

    // Add milestone
    const milestone = await prisma.milestone.create({
      data: {
        title,
        dueDate: new Date(dueDate),
        project: { connect: { id } },
      },
    })

    res.status(201).json(milestone)
  } catch (error) {
    console.error("Add milestone error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update milestone
router.put("/:projectId/milestones/:milestoneId", async (req: any, res) => {
  try {
    const { projectId, milestoneId } = req.params
    const { title, dueDate, completed } = req.body

    // Check if user is project owner or leader
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          where: {
            userId: req.user.id,
            role: "LEADER",
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id && project.members.length === 0) {
      return res.status(403).json({ error: "Not authorized to update milestones in this project" })
    }

    // Update milestone
    const milestone = await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        completed,
      },
    })

    res.json(milestone)
  } catch (error) {
    console.error("Update milestone error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Generate timestamp proof for project
router.post("/:id/timestamp", async (req: any, res) => {
  try {
    const { id } = req.params

    // Check if user is project owner
    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      return res.status(404).json({ error: "Project not found" })
    }

    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to timestamp this project" })
    }

    // Generate timestamp hash
    const timestamp = new Date().toISOString()
    const dataToHash = `${project.id}-${project.title}-${timestamp}`
    const hash = crypto.createHash("sha256").update(dataToHash).digest("hex")

    // Update project with timestamp proof
    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        timestampProof: hash,
      },
    })

    res.json({
      timestamp,
      hash: updatedProject.timestampProof,
    })
  } catch (error) {
    console.error("Timestamp error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

