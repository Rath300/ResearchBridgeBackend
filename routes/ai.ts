import express from "express"
import { PrismaClient } from "@prisma/client"
import { Configuration, OpenAIApi } from "openai"

const router = express.Router()
const prisma = new PrismaClient()

// Configure OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

// Generate research paper summary
router.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body

    if (!text) {
      return res.status(400).json({ error: "Text is required" })
    }

    // Limit text length
    const truncatedText = text.substring(0, 4000)

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `Summarize the following research paper in 3-5 paragraphs:\n\n${truncatedText}`,
      max_tokens: 500,
      temperature: 0.5,
    })

    const summary = response.data.choices[0].text?.trim()

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
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `Based on the following research papers and interests (${userInterests.join(", ")}), suggest 5 research topics that would be interesting to explore:\n\n${paperDescriptions}\n\nRecommended research topics:`,
      max_tokens: 500,
      temperature: 0.7,
    })

    const recommendations = response.data.choices[0].text?.trim()

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

    let prompt
    switch (type) {
      case "abstract":
        prompt = `Improve the following research paper abstract to be more concise, clear, and impactful:\n\n${truncatedText}`
        break
      case "methodology":
        prompt = `Improve the following research methodology section to be more precise, detailed, and scientifically sound:\n\n${truncatedText}`
        break
      case "discussion":
        prompt = `Improve the following research discussion section to better analyze results and connect to existing literature:\n\n${truncatedText}`
        break
      default:
        prompt = `Improve the following research writing to be more academic, clear, and impactful:\n\n${truncatedText}`
    }

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      max_tokens: 1000,
      temperature: 0.4,
    })

    const improvedText = response.data.choices[0].text?.trim()

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

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `Generate ${count} specific, focused research questions for a study on "${topic}" that would be suitable for high school student researchers:`,
      max_tokens: 500,
      temperature: 0.7,
    })

    const questions = response.data.choices[0].text?.trim()

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

