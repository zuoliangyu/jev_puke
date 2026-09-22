FROM node:22-alpine

WORKDIR /app

COPY package.json server.mjs index.html styles.css README.md ./
COPY src ./src
COPY styles ./styles

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.mjs"]
