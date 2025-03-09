FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 10000

# Start command
CMD ["npm", "start"]

