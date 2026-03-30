# Stage 1: Build the React Application
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

# Copy built assets (the files from /app/dist) from the build stage to the /usr/share/nginx/html directory in the nginx container
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80. this is done to allow the container to listen on port 80. 
# example of full port on url - http://localhost:80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
# daemon is a flag that tells nginx to run in the background
# this is off to keep the container running
