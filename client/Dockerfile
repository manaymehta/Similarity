# Stage 1: Build the React Application
FROM node:18-alpine as build

WORKDIR /app

# the alphanumerics in syntax means it will copy all the files starting with package and ending with json
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx which in detail is a web server that can serve static files and can be used as a reverse proxy (it can forward requests to other servers) for dynamic content 
FROM nginx:alpine

# Copy built assets (the files from /app/dist) from the build stage to the /usr/share/nginx/html directory
# this is done to serve the static files (html, css, js) to the client
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80. this is done to allow the container to listen on port 80. 
# example of full port on url - http://localhost:80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
# daemon is a flag that tells nginx to run in the background
# this is off to keep the container running
