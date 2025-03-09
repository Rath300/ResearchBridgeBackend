import express from "express"
import { PrismaClient } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"
import multer from "multer"

const router = express.Router()
const prisma = new PrismaClient()

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
})

// Create a new document
router.post("/documents", async (req: any, res) => {
  try {
    const { title, type, content, projectId } = req.body

    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: req.user.id,
      },
    })

    if (!projectMember) {
      return res.status(403).json({ error: "Not authorized to create documents in this project" })
    }

    // Create document
    const document = await prisma.document.create({
      data: {
        title,
        type,
        content,
        author: { connect: { id: req.user.id } },
        project: { connect: { id: projectId } },
      },
    })

    res.status(201).json(document)
  } catch (error) {
    console.error("Create document error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get document by ID
router.get("/documents/:id", async (req: any, res) => {
  try {
    const { id } = req.params

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, avatar: true },
        },
        project: {
          select: { id: true, title: true },
        },
        edits: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId: document.project.id,
        userId: req.user.id,
      },
    })

    if (!projectMember) {
      return res.status(403).json({ error: "Not authorized to view this document" })
    }

    res.json(document)
  } catch (error) {
    console.error("Get document error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update document
router.put("/documents/:id", async (req: any, res) => {
  try {
    const { id } = req.params
    const { title, content } = req.body

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId: document.project.id,
        userId: req.user.id,
      },
    })

    if (!projectMember) {
      return res.status(403).json({ error: "Not authorized to update this document" })
    }

    // Create document edit record
    await prisma.documentEdit.create({
      data: {
        content: document.content || "",
        document: { connect: { id } },
        user: { connect: { id: req.user.id } },
      },
    })

    // Update document
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        title,
        content,
        updatedAt: new Date(),
      },
    })

    res.json(updatedDocument)
  } catch (error) {
    console.error("Update document error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Upload document file to Supabase Storage
router.post("/documents/upload", upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { projectId, title, type } = req.body

    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: req.user.id,
      },
    })

    if (!projectMember) {
      return res.status(403).json({ error: "Not authorized to upload documents to this project" })
    }

    // Upload to Supabase Storage
    const fileBuffer = req.file.buffer
    const fileName = `documents/${projectId}/${Date.now()}-${req.file.originalname}`

    const { data, error } = await supabase.storage.from("researchbridge").upload(fileName, fileBuffer, {
      contentType: req.file.mimetype,
      upsert: true,
    })

    if (error) {
      throw error
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("researchbridge").getPublicUrl(fileName)

    const fileUrl = urlData.publicUrl

    // Create document record
    const document = await prisma.document.create({
      data: {
        title: title || req.file.originalname,
        type: type || "DATA",
        content: fileUrl,
        author: { connect: { id: req.user.id } },
        project: { connect: { id: projectId } },
      },
    })

    res.status(201).json({
      document,
      fileUrl,
    })
  } catch (error) {
    console.error("Document upload error:", error)
    res.status(500).json({ error: "Server error during document upload" })
  }
})

// Delete document
router.delete("/documents/:id", async (req: any, res) => {
  try {
    const { id } = req.params

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Check if user is project owner or document author
    if (document.authorId !== req.user.id && document.project.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to delete this document" })
    }

    // If document content is a Supabase URL, delete the file
    if (document.content && document.content.includes(supabaseUrl)) {
      const filePath = document.content.split("/").slice(-2).join("/")

      await supabase.storage.from("researchbridge").remove([filePath])
    }

    // Delete document
    await prisma.document.delete({
      where: { id },
    })

    res.json({ message: "Document deleted successfully" })
  } catch (error) {
    console.error("Delete document error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get document edit history
router.get("/documents/:id/history", async (req: any, res) => {
  try {
    const { id } = req.params
    const { page = 1, limit = 20 } = req.query
    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Check if user is a member of the project
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId: document.project.id,
        userId: req.user.id,
      },
    })

    if (!projectMember) {
      return res.status(403).json({ error: "Not authorized to view this document history" })
    }

    // Get edit history
    const edits = await prisma.documentEdit.findMany({
      where: { documentId: id },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number.parseInt(limit as string),
    })

    // Get total count for pagination
    const total = await prisma.documentEdit.count({
      where: { documentId: id },
    })

    res.json({
      edits,
      pagination: {
        total,
        page: Number.parseInt(page as string),
        limit: Number.parseInt(limit as string),
        pages: Math.ceil(total / Number.parseInt(limit as string)),
      },
    })
  } catch (error) {
    console.error("Get document history error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

