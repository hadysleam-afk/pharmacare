FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 DB_FILE=/data/pharmacare.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
