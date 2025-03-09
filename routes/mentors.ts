import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();
const prisma = new PrismaClient();

// Get all mentor profiles
router.get("/", async (req, res) => {
  try {
    const mentors = await prisma.mentorProfile.findMany({
      include: {
        user: true,
        reviews: true,
      },
    });
    res.json(mentors);
  } catch (error) {
    res.status(500).json({ error: "Error fetching mentors" });
  }
});

// Create a mentor profile
router.post("/", async (req: any, res) => {
  try {
    const { title, institution, specialties, bio, availability } = req.body;
    const mentorProfile = await prisma.mentorProfile.create({
      data: {
        title,
        institution,
        specialties,
        bio,
        availability,
        user: {
          connect: { id: req.user.id },
        },
      },
      include: {
        user: true,
      },
    });
    res.json(mentorProfile);
  } catch (error) {
    res.status(500).json({ error: "Error creating mentor profile" });
  }
});

export default router; 