import express from "express"
import { PrismaClient } from "@prisma/client"

const router = express.Router()
const prisma = new PrismaClient()

// Global search across users, projects, and articles
router.get("/", async (req: any, res) => {
  try {
    const { query, type, page = 1, limit = 10 } = req.query
    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)

    if (!query) {
      return res.status(400).json({ error: "Search query is required" })
    }

    // Save search query to history
    await prisma.searchQuery.create({
      data: {
        query: query as string,
        user: { connect: { id: req.user.id } },
      },
    })

    const results: any = {}
    let total = 0

    // Search based on type
    if (!type || type === "users") {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query as string, mode: "insensitive" } },
            { bio: { contains: query as string, mode: "insensitive" } },
            { school: { contains: query as string, mode: "insensitive" } },
            { interests: { hasSome: [query] } },
          ],
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          school: true,
          grade: true,
          interests: true,
          bio: true,
        },
        skip: type ? skip : 0,
        take: type ? Number.parseInt(limit as string) : 5,
      })

      results.users = users

      if (type === "users") {
        total = await prisma.user.count({
          where: {
            OR: [
              { name: { contains: query as string, mode: "insensitive" } },
              { bio: { contains: query as string, mode: "insensitive" } },
              { school: { contains: query as string, mode: "insensitive" } },
              { interests: { hasSome: [query] } },
            ],
          },
        })
      }
    }

    if (!type || type === "projects") {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { title: { contains: query as string, mode: "insensitive" } },
            { description: { contains: query as string, mode: "insensitive" } },
            { category: { hasSome: [query] } },
          ],
          visibility: "PUBLIC",
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        skip: type ? skip : 0,
        take: type ? Number.parseInt(limit as string) : 5,
      })

      results.projects = projects

      if (type === "projects") {
        total = await prisma.project.count({
          where: {
            OR: [
              { title: { contains: query as string, mode: "insensitive" } },
              { description: { contains: query as string, mode: "insensitive" } },
              { category: { hasSome: [query] } },
            ],
            visibility: "PUBLIC",
          },
        })
      }
    }

    if (!type || type === "articles") {
      const articles = await prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: query as string, mode: "insensitive" } },
            { abstract: { contains: query as string, mode: "insensitive" } },
            { content: { contains: query as string, mode: "insensitive" } },
            { tags: { hasSome: [query] } },
          ],
          status: "PUBLISHED",
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        skip: type ? skip : 0,
        take: type ? Number.parseInt(limit as string) : 5,
      })

      results.articles = articles

      if (type === "articles") {
        total = await prisma.article.count({
          where: {
            OR: [
              { title: { contains: query as string, mode: "insensitive" } },
              { abstract: { contains: query as string, mode: "insensitive" } },
              { content: { contains: query as string, mode: "insensitive" } },
              { tags: { hasSome: [query] } },
            ],
            status: "PUBLISHED",
          },
        })
      }
    }

    if (!type) {
      // If no type specified, return top results from each category
      res.json({ results })
    } else {
      // If type specified, return paginated results
      res.json({
        results: results[type],
        pagination: {
          total,
          page: Number.parseInt(page as string),
          limit: Number.parseInt(limit as string),
          pages: Math.ceil(total / Number.parseInt(limit as string)),
        },
      })
    }
  } catch (error) {
    console.error("Search error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get trending searches
router.get("/trending", async (req, res) => {
  try {
    const trendingSearches = await prisma.searchQuery.groupBy({
      by: ["query"],
      _count: {
        query: true,
      },
      orderBy: {
        _count: {
          query: "desc",
        },
      },
      take: 10,
    })

    res.json(
      trendingSearches.map((item) => ({
        query: item.query,
        count: item._count.query,
      })),
    )
  } catch (error) {
    console.error("Trending searches error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user's search history
router.get("/history", async (req: any, res) => {
  try {
    const searchHistory = await prisma.searchQuery.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    })

    res.json(searchHistory)
  } catch (error) {
    console.error("Search history error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Clear user's search history
router.delete("/history", async (req: any, res) => {
  try {
    await prisma.searchQuery.deleteMany({
      where: {
        userId: req.user.id,
      },
    })

    res.json({ message: "Search history cleared" })
  } catch (error) {
    console.error("Clear search history error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router

