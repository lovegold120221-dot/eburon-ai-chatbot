FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 11434

ENV MIDDLEWARE_PORT=11434
ENV OLLAMA_BASE_URL=http://host.docker.internal:11434
ENV MIDDLEWARE_API_KEY=eburon-local

CMD ["node", "server.js"]
