FROM node:18 as builder

# Create app directory
WORKDIR /app_build

# Install app dependencies
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:18

ARG NODE_ENV=production

ENV NODE_ENV $NODE_ENV

ARG SLACK_SIGNING_SECRET_ARG
ARG SLACK_BOT_TOKEN_ARG
ARG APP_TOKEN_ARG
ARG OPENAI_API_KEY_ARG
ARG LEAP_API_KEY_ARG
ARG SUPABASE_URL_ARG
ARG SUPABASE_TOKEN_ARG
ARG VAPID_PUBLIC_KEY_ARG
ARG VAPID_PRIVATE_KEY_ARG


# SLACK
ENV SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET_ARG}
ENV SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN_ARG}
ENV APP_TOKEN=${APP_TOKEN_ARG}
# OPEN AI
ENV OPENAI_API_KEY=${OPENAI_API_KEY_ARG}
# LEAP
ENV LEAP_API_KEY=${LEAP_API_KEY_ARG}
# SUPABASE
ENV SUPABASE_URL=${SUPABASE_URL_ARG}
ENV SUPABASE_TOKEN=${SUPABASE_TOKEN_ARG}
# WEB PUSH NOTIFICATIONS
ENV VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY_ARG}
ENV VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY_ARG}

ENV BASE_PATH=/build
ENV DB_URL=/database/database.sqlite
ENV ADMIN_MAIL="admin@bot.com"

ENV SOCKET_URL = "http://localhost:3001"
ENV REDIS_HOST "redis://host.docker.internal"


WORKDIR /app

COPY --from=builder /app_build/build ./build

# COPY ./build ./build
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN NODE_ENV=$NODE_ENV npm install

# Expose the port your app is running on (e.g., 3000)
EXPOSE 4000
EXPOSE 3001

# Define the command to run your Node.js application
CMD [ "node", "build/index.js" ]