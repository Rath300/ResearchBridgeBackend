import express from "express"
import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"

const router = express.Router()
const prisma = new PrismaClient()

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Generate research paper summary
router.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body

    if (!text) {
      return res.status(400).json({ error: "Text is required" })
    }

    // Limit text length
    const truncatedText = text.substring(0, 4000)

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful research assistant that summarizes academic papers.",
        },
        {
          role: "user",
          content: `Summarize the following research paper in 3-5 paragraphs:\n\n${truncatedText}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.5,
    })

    const summary = response.choices[0].message.content?.trim()

    res.json({ summary })
  } catch (error) {
    console.error("AI summarize error:", error)
    res.status(500).json({ error: "AI service error" })
  }
})

// Get research paper recommendations
router.post("/recommendations", async (req: any, res) => {
  try {
    const { interests, recentPapers } = req.body

    // Get user's interests if not provided
    let userInterests = interests
    if (!userInterests || userInterests.length === 0) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { interests: true },
      })

      userInterests = user?.interests || []
    }

    // Get recent papers if not provided
    let papers = recentPapers
    if (!papers || papers.length === 0) {
      papers = await prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          tags: { hasSome: userInterests },
        },
        select: {
          id: true,
          title: true,
          abstract: true,
          tags: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { publishedDate: "desc" },
        take: 10,
      })
    }

    // Format papers for recommendation
    const paperDescriptions = papers
      .map((paper: { title: string; abstract: string; tags: string[] }) => 
        `Title: ${paper.title}\nAbstract: ${paper.abstract}\nTags: ${paper.tags.join(", ")}`)
      .join("\n\n")

    // Generate recommendations using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful research advisor that suggests research topics based on interests and recent papers.",
        },
        {
          role: "user",
          content: `Based on the following research papers and interests (${userInterests.join(", ")}), suggest 5 research topics that would be interesting to explore:\n\n${paperDescriptions}\n\nRecommended research topics:`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const recommendations = response.choices[0].message.content?.trim()

    // Parse recommendations into an array
    const recommendationArray = recommendations
      ?.split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())

    res.json({ recommendations: recommendationArray })
  } catch (error) {
    console.error("AI recommendations error:", error)
    res.status(500).json({ error: "AI service error" })
  }
})

// Improve research writing
router.post("/improve-writing", async (req, res) => {
  try {
    const { text, type = "general" } = req.body

    if (!text) {
      return res.status(400).json({ error: "Text is required" })
    }

    // Limit text length
    const truncatedText = text.substring(0, 4000)

    let systemPrompt
    switch (type) {
      case "abstract":
        systemPrompt = "You are a research writing expert specializing in academic abstracts."
        break
      case "methodology":
        systemPrompt = "You are a research methodology expert specializing in scientific writing."
        break
      case "discussion":
        systemPrompt = "You are a research writing expert specializing in discussion and analysis sections."
        break
      default:
        systemPrompt = "You are an academic writing expert specializing in research papers."
    }

    let userPrompt
    switch (type) {
      case "abstract":
        userPrompt = `Improve the following research paper abstract to be more concise, clear, and impactful:\n\n${truncatedText}`
        break
      case "methodology":
        userPrompt = `Improve the following research methodology section to be more precise, detailed, and scientifically sound:\n\n${truncatedText}`
        break
      case "discussion":
        userPrompt = `Improve the following research discussion section to better analyze results and connect to existing literature:\n\n${truncatedText}`
        break
      default:
        userPrompt = `Improve the following research writing to be more academic, clear, and impactful:\n\n${truncatedText}`
    }

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.4,
    })

    const improvedText = response.choices[0].message.content?.trim()

    res.json({ improvedText })
  } catch (error) {
    console.error("AI improve writing error:", error)
    res.status(500).json({ error: "AI service error" })
  }
})

// Generate research questions
router.post("/research-questions", async (req, res) => {
  try {
    const { topic, count = 5 } = req.body

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" })
    }

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a research advisor specializing in helping high school students develop research questions.",
        },
        {
          role: "user",
          content: `Generate ${count} specific, focused research questions for a study on "${topic}" that would be suitable for high school student researchers:`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const questions = response.choices[0].message.content?.trim()

    // Parse questions into an array
    const questionArray = questions
      ?.split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())

    res.json({ questions: questionArray })
  } catch (error) {
    console.error("AI research questions error:", error)
    res.status(500).json({ error: "AI service error" })
  }
})

export default router

