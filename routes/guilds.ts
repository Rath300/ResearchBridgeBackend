import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();
const prisma = new PrismaClient();

// Get all guilds
router.get("/", async (req, res) => {
  try {
    const guilds = await prisma.guild.findMany({
      include: {
        owner: true,
        members: true,
        projects: true,
      },
    });
    res.json(guilds);
  } catch (error) {
    res.status(500).json({ error: "Error fetching guilds" });
  }
});

// Create a new guild
router.post("/", async (req: any, res) => {
  try {
    const { name, description, categories, logo } = req.body;
    const guild = await prisma.guild.create({
      data: {
        name,
        description,
        categories,
        logo,
        owner: {
          connect: { id: req.user.id },
        },
      },
      include: {
        owner: true,
      },
    });
    res.json(guild);
  } catch (error) {
    res.status(500).json({ error: "Error creating guild" });
  }
});

export default router; 