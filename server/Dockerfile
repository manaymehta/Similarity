# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# Only install production dependencies
RUN npm install --omit=dev
# Copy only the compiled code from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 5000
# Run the compiled JavaScript directly with node
CMD ["node", "dist/index.js"]
