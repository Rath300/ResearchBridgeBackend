import express from "express"
import { PrismaClient } from "@prisma/client"

const router = express.Router()
const prisma = new PrismaClient()

// Get user conversations
router.get("/conversations", async (req: any, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    // Format conversations for client
    const formattedConversations = conversations.map((conversation) => {
      const otherParticipants = conversation.participants.filter((p) => p.userId !== req.user.id).map((p) => p.user)

      const userParticipant = conversation.participants.find((p) => p.userId === req.user.id)

      // Calculate unread messages
      const unreadCount =
        conversation.messages.length > 0 && conversation.messages[0].createdAt > userParticipant?.lastRead ? 1 : 0

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.type === "DIRECT" ? otherParticipants[0]?.name : conversation.name,
        avatar: conversation.type === "DIRECT" ? otherParticipants[0]?.avatar : null,
        participants: otherParticipants,
        lastMessage: conversation.messages[0] || null,
        unreadCount,
        updatedAt: conversation.updatedAt,
      }
    })

    res.json(formattedConversations)
  } catch (error) {
    console.error("Get conversations error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Create a new conversation
router.post("/conversations", async (req: any, res) => {
  try {
    const { type, name, participantIds } = req.body

    // Make sure current user is included in participants
    if (!participantIds.includes(req.user.id)) {
      participantIds.push(req.user.id)
    }

    // For direct messages, check if conversation already exists
    if (type === "DIRECT" && participantIds.length === 2) {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: "DIRECT",
          AND: [
            {
              participants: {
                some: {
                  userId: participantIds[0],
                },
              },
            },
            {
              participants: {
                some: {
                  userId: participantIds[1],
                },
              },
            },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
          },
        },
      })

      if (existingConversation) {
        return res.json(existingConversation)
      }
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type,
        name: type === "GROUP" ? name : null,
        participants: {
          create: participantIds.map((userId: string) => ({
            user: { connect: { id: userId } },
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    })

    res.status(201).json(conversation)
  } catch (error) {
    console.error("Create conversation error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get messages for a conversation
router.get("/conversations/:id/messages", async (req: any, res) => {
  try {
    const { id } = req.params
    const { page = 1, limit = 50 } = req.query
    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)

    // Check if user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId: req.user.id,
      },
    })

    if (!participant) {
      return res.status(403).json({ error: "Not authorized to view this conversation" })
    }

    // Get messages
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number.parseInt(limit as string),
    })

    // Update last read timestamp
    await prisma.conversationParticipant.update({
      where: {
        id: participant.id,
      },
      data: {
        lastRead: new Date(),
      },
    })

    // Get total count for pagination
    const total = await prisma.message.count({
      where: { conversationId: id },
    })

    res.json({
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        total,
        page: Number.parseInt(page as string),
        limit: Number.parseInt(limit as string),
        pages: Math.ceil(total / Number.parseInt(limit as string)),
      },
    })
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Send a message
router.post("/conversations/:id/messages", async (req: any, res) => {
  try {
    const { id } = req.params
    const { content } = req.body

    // Check if user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId: req.user.id,
      },
    })

    if (!participant) {
      return res.status(403).json({ error: "Not authorized to send messages in this conversation" })
    }

    // Get other participants
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
    });
    
    const otherParticipants = participants.filter(p => p.userId !== req.user.id);
    
    if (otherParticipants.length === 0) {
      return res.status(400).json({ error: "No other participants in conversation" });
    }

    // Fix for userParticipant.lastRead
    const userParticipant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId: req.user.id,
      },
    });

    if (!userParticipant || !userParticipant.lastRead) {
      return res.status(404).json({ error: "User participant not found" });
    }

    // Now we can safely use userParticipant.lastRead
    const unreadMessages = await prisma.message.count({
      where: {
        conversationId: id,
        createdAt: {
          gt: userParticipant.lastRead,
        },
      },
    });

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        sender: { connect: { id: req.user.id } },
        receiver: { connect: { id: otherParticipants[0].userId } },
        conversation: { connect: { id } },
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    })

    // Update sender's last read timestamp
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastRead: new Date() },
    })

    res.status(201).json(message)
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

