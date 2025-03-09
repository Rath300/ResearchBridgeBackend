import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  try {
    const secret = process.env.JWT_SECRET || "your_jwt_secret"
    const decoded = jwt.verify(token, secret) as { id: string; email: string }
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" })
  }
}

export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Additional admin check if needed
  if (req.user?.email === process.env.ADMIN_EMAIL) {
    next()
  } else {
    return res.status(403).json({ error: "Admin access required" })
  }
}

