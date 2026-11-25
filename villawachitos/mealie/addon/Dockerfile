FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
