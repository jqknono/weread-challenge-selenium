FROM node:lts-alpine

WORKDIR /app
COPY ./src/weread-challenge.js ./app.js
COPY package.json package-lock.json ./
RUN npm install --omit=dev

CMD ["node", "app.js"]