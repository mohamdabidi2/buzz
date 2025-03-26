# Use official Node.js image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Build the app (if needed)
# RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]