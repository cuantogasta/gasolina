FROM apify/actor-node:20

COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && rm -r ~/.npm

COPY --chown=myuser . ./

CMD npm start --silent
