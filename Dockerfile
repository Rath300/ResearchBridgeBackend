FROM node:18-alpine

# Install build dependencies and OpenSSL 1.1
RUN apk add --no-cache python3 make g++ openssl1.1-compat

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 10000

# Start command
CMD ["npm", "start"]

