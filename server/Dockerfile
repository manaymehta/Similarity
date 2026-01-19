# Use a lightweight Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the application port
EXPOSE 5000

# Start the server
CMD ["npm", "run", "dev"]
# Note: In a real production setup, you might want to run 'node dist/index.js' 
# but 'npm run dev' (nodemon) is fine for this learning phase/dev container.
# If you want strict production: 
# CMD ["node", "dist/index.js"]
