const fetch = require("node-fetch")

async function pingService() {
  try {
    const response = await fetch(process.env.BACKEND_URL + "/health")
    const data = await response.json()
    console.log("Service status:", data)
  } catch (error) {
    console.error("Error pinging service:", error)
  }
}

pingService()

