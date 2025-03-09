import type { Server } from "socket.io"
import type { PrismaClient } from "@prisma/client"
import jwt from "jsonwebtoken"

// Socket options optimized for free hosting
const socketOptions = {
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket"],
  allowUpgrades: false,
}

export const setupSocketHandlers = (io: Server, prisma: PrismaClient) => {
  // Set socket options
  io.engine.opts.pingTimeout = socketOptions.pingTimeout
  io.engine.opts.pingInterval = socketOptions.pingInterval

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error("Authentication error"))
    }

    try {
      const secret = process.env.JWT_SECRET || "your_jwt_secret"
      const decoded = jwt.verify(token, secret) as { id: string; email: string }
      socket.data.user = decoded
      next()
    } catch (error) {
      next(new Error("Authentication error"))
    }
  })

  // Connection handler
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.user.id}`)

    // Join user's room for private messages
    socket.join(`user:${socket.data.user.id}`)

    // Handle joining conversation rooms
    socket.on("join-conversation", async (conversationId) => {
      try {
        // Check if user is a participant
        const participant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: socket.data.user.id,
          },
        })

        if (participant) {
          socket.join(`conversation:${conversationId}`)
          console.log(`User ${socket.data.user.id} joined conversation ${conversationId}`)
        }
      } catch (error) {
        console.error("Join conversation error:", error)
      }
    })

    // Handle joining document rooms
    socket.on("join-document", async (documentId) => {
      try {
        // Check if user has access to the document
        const document = await prisma.document.findUnique({
          where: { id: documentId },
          include: { project: true },
        })

        if (!document) {
          return
        }

        const projectMember = await prisma.projectMember.findFirst({
          where: {
            projectId: document.projectId,
            userId: socket.data.user.id,
          },
        })

        if (projectMember) {
          socket.join(`document:${documentId}`)
          console.log(`User ${socket.data.user.id} joined document ${documentId}`)

          // Notify others that user joined
          socket.to(`document:${documentId}`).emit("user-joined", {
            userId: socket.data.user.id,
            documentId,
          })
        }
      } catch (error) {
        console.error("Join document error:", error)
      }
    })

    // Handle document changes
    socket.on("document-change", async (data) => {
      try {
        const { documentId, content, position } = data

        // Broadcast changes to others in the document room
        socket.to(`document:${documentId}`).emit("document-change", {
          documentId,
          content,
          position,
          userId: socket.data.user.id,
        })
      } catch (error) {
        console.error("Document change error:", error)
      }
    })

    // Handle new messages
    socket.on("new-message", async (data) => {
      try {
        const { conversationId, message } = data

        // Broadcast message to conversation room
        socket.to(`conversation:${conversationId}`).emit("new-message", {
          conversationId,
          message: {
            id: message.id,
            content: message.content,
            senderId: socket.data.user.id,
            createdAt: message.createdAt,
          },
        })
      } catch (error) {
        console.error("New message error:", error)
      }
    })

    // Handle typing indicators
    socket.on("typing", (data) => {
      const { conversationId, isTyping } = data

      socket.to(`conversation:${conversationId}`).emit("user-typing", {
        userId: socket.data.user.id,
        isTyping,
      })
    })

    // Handle user presence
    socket.on("set-presence", async (status) => {
      try {
        // Broadcast to all users who might be interested
        io.emit("user-presence-change", {
          userId: socket.data.user.id,
          status,
        })
      } catch (error) {
        console.error("Set presence error:", error)
      }
    })

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.user.id}`)

      // Notify others that user is offline
      io.emit("user-presence-change", {
        userId: socket.data.user.id,
        status: "offline",
      })
    })
  })
}

