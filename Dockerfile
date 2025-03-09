FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy server package files
COPY server/package*.json ./
RUN npm install

# Generate Prisma client
COPY server/prisma ./prisma/
RUN npx prisma generate

# Copy server source code
COPY server/ .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 10000

# Start command
CMD ["npm", "start"]

