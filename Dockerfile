FROM node:lts-alpine

WORKDIR /app
COPY ./src/weread-challenge.js ./app.js
COPY package.json package-lock.json ./
RUN npm install --omit=dev

EXPOSE 8788
CMD ["node", "app.js"]